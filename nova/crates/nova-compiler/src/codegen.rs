//! WASM emission of the "program module" (plan §3.4, §4) via `wasm-encoder`.
//!
//! Compilation model:
//! - Everything is lazy: builtin-call args, value-call args, list elements
//!   and repetition counts are compiled *as lazy handles*: integer/boolean
//!   literals, variables, lists, closures and captures are already values and
//!   are compiled directly; calls / value calls / repetitions are wrapped in
//!   thunks (`nova_rt.thunk_new(fnidx, env)`), one `$clo` function per thunk.
//! - One `$clo = (func (param i32 i32 i32) (result i64))` — `(env, args,
//!   argc)` — WASM function per thunk body / closure body, placed in the
//!   imported funcref table via an element segment (slots 0..N).
//! - `__main() -> i64` evaluates the root expression (env = 0).
//! - Lexical addressing: a variable reference is (depth, slot); the emitted
//!   code follows ENV parent pointers (see `layout.rs`).
//! - Closure prologue: copy args from `args_ptr` into a fresh ENV
//!   (`nova_rt.env_new(captured_env, arity)`) before evaluating the body
//!   (copy-on-entry: the scratch args buffer is clobbered by nested calls).
//! - Value calls: force the callee first, then write args into the scratch
//!   buffer (`nova_rt.args_buf`; for argc > `ARGS_BUF_SLOTS` a fresh env is
//!   used as the arg buffer instead), then `nova_rt.call_callable`.
//! - Const pool (plan §3.4): literal lists whose elements are recursively
//!   pure literals are hoisted — one mutable i64 global per DISTINCT
//!   constant (structural dedup, program-wide, at every nesting level),
//!   initialized by `__main`'s prologue and read via `global.get` at each
//!   occurrence (see the "Const pool" section below for the safety
//!   argument).
//! - Checkpoints (plan §3.9): every regular-call and value-call site is
//!   guarded by `nova_rt.__checkpoint` — a fired checkpoint's ERROR handle
//!   becomes the call node's own value. `#`/repetition is not a call in
//!   naive and gets no checkpoint of its own. Guards exist only under the
//!   default `checkpoints` cargo feature: `--no-default-features` builds a
//!   MEASUREMENT-ONLY guardless compiler (no guards, no `__checkpoint`
//!   import; the soft timeout silently stops working — not a supported
//!   shipping configuration).

use std::collections::{BTreeSet, HashMap};

use dicexp_nova_abi::{self as abi, find_builtin};
#[cfg(feature = "checkpoints")]
use wasm_encoder::BlockType;
use wasm_encoder::{
    CodeSection, ConstExpr, ElementSection, Elements, EntityType, ExportKind, ExportSection,
    Function, FunctionSection, GlobalSection, GlobalType, ImportSection, Instruction, MemArg,
    MemoryType, Module, RefType, TableType, TypeSection, ValType,
};

use crate::ast::{Node, Value};
use crate::layout;

/// The import module for `env.memory` / `env.table` (plan §3.8). Not defined
/// in `dicexp-nova-abi` (only the member names are), so it is defined here.
const ENV_MODULE: &str = "env";

/// What the native API returns on success.
pub struct EmitResult {
    pub wasm_bytes: Vec<u8>,
    /// Number of funcref table slots the program populates (slots 0..N).
    pub table_size: u32,
}

// ---------------------------------------------------------------------------
// Runtime import signatures
// ---------------------------------------------------------------------------

/// Canonical ordering for `nova_rt` runtime-function imports (deterministic).
const RT_ORDER: [&str; 10] = [
    abi::rt::THUNK_NEW,
    abi::rt::FORCE,
    abi::rt::CLOSURE_NEW,
    abi::rt::CAPTURE_NEW,
    abi::rt::ENV_NEW,
    abi::rt::LIST_NEW,
    abi::rt::ARGS_BUF,
    abi::rt::CALL_CALLABLE,
    abi::rt::REPEAT,
    abi::rt::CHECKPOINT,
];

fn rt_signature(name: &str) -> (&'static [ValType], &'static [ValType]) {
    const I32: ValType = ValType::I32;
    const I64: ValType = ValType::I64;
    match name {
        n if n == abi::rt::THUNK_NEW => (&[I32, I32], &[I64]),
        n if n == abi::rt::FORCE => (&[I64], &[I64]),
        n if n == abi::rt::CLOSURE_NEW => (&[I32, I32, I32], &[I64]),
        n if n == abi::rt::CAPTURE_NEW => (&[I32, I32], &[I64]),
        n if n == abi::rt::ENV_NEW => (&[I32, I32], &[I32]),
        n if n == abi::rt::LIST_NEW => (&[I32], &[I32]),
        n if n == abi::rt::ARGS_BUF => (&[], &[I32]),
        n if n == abi::rt::CALL_CALLABLE => (&[I64, I32, I32], &[I64]),
        n if n == abi::rt::REPEAT => (&[I64, I64], &[I64]),
        n if n == abi::rt::CHECKPOINT => (&[], &[I64]),
        _ => unreachable!("unknown rt import: {name}"),
    }
}

// ---------------------------------------------------------------------------
// Use collection (which imports are needed)
// ---------------------------------------------------------------------------

#[derive(Default)]
struct Uses {
    rt: BTreeSet<&'static str>,
    builtins: BTreeSet<&'static str>,
}

/// A node compiles to a value directly (no thunk needed in lazy positions).
fn is_direct(node: &Node) -> bool {
    matches!(node, Node::Variable(..) | Node::Value(..))
}

// ---------------------------------------------------------------------------
// Const pool (plan §3.4)
// ---------------------------------------------------------------------------

/// A recursively pure literal tree — the hoistable class (plan §3.4):
/// Integer, Boolean, or a list of such trees. Anything else (calls,
/// variables, closures, captures) is NOT hoistable. Top-level scalars are
/// not hoisted either (already inline i64 consts — nothing to gain); only
/// lists enter the pool, but their element trees are described by this type.
/// Structural equality over the tree is the program-wide dedup key.
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
enum Const {
    Int(i64),
    Bool(bool),
    List(Vec<Const>),
}

/// Classify `node` as a `Const`; `None` for anything not a pure literal.
fn classify_const(node: &Node) -> Option<Const> {
    match node {
        Node::Value(Value::Integer(n), _) => Some(Const::Int(*n)),
        Node::Value(Value::Boolean(b), _) => Some(Const::Bool(*b)),
        Node::Value(Value::List(items), _) => {
            let mut elems = Vec::with_capacity(items.len());
            for item in items {
                elems.push(classify_const(item)?);
            }
            Some(Const::List(elems))
        }
        _ => None,
    }
}

/// The program-wide const pool: one entry per DISTINCT hoistable list
/// constant, in dependency (inner-first) order — an entry's nested-list
/// elements are always EARLIER entries, so `__main`'s prologue can
/// initialize globals in plain index order while referring to
/// already-initialized child globals.
struct ConstPool {
    entries: Vec<Const>,
    index: HashMap<Const, u32>,
}

impl ConstPool {
    fn new() -> Self {
        ConstPool { entries: Vec::new(), index: HashMap::new() }
    }

    /// Intern a hoistable list (by its element list); returns its global
    /// index. Idempotent: structurally-identical constants dedup to one
    /// entry — including nested lists, which are interned as their own
    /// pool entries so equal inner lists share one global across different
    /// outer constants.
    fn intern_list(&mut self, elems: &[Const]) -> u32 {
        let key = Const::List(elems.to_vec());
        if let Some(&i) = self.index.get(&key) {
            return i;
        }
        // Inner-first: intern nested lists before this one (a no-op for
        // already-interned children), so children get smaller indices.
        for e in elems {
            if let Const::List(inner) = e {
                self.intern_list(inner);
            }
        }
        let i = self.entries.len() as u32;
        self.entries.push(key.clone());
        self.index.insert(key, i);
        i
    }

    /// Global index of an interned constant. The `build_const_pool`
    /// pre-pass interns every hoistable list before emission starts, and
    /// emission classifies with the same [`classify_const`], so this always
    /// succeeds (internal-invariant expect, same style as [`Codegen::rt`]).
    fn index_of(&self, c: &Const) -> u32 {
        *self.index.get(c).expect("hoisted const interned by the pre-pass")
    }
}

/// Pre-pass: intern every hoistable list constant in the program into
/// `pool`. Walks everywhere `collect_uses` walks. A non-hoistable list's
/// elements are still walked — nested hoistable lists inside them hoist on
/// their own (e.g. `[1 + 2, [3, 4]]` hoists `[3, 4]`).
fn build_const_pool(node: &Node, pool: &mut ConstPool) {
    match node {
        Node::Variable(..) => {}
        Node::Value(v, _) => match v {
            Value::Integer(_) | Value::Boolean(_) => {}
            Value::List(items) => {
                if let Some(elems) =
                    items.iter().map(classify_const).collect::<Option<Vec<_>>>()
                {
                    pool.intern_list(&elems);
                    // Elements are pure literals — nothing further inside.
                } else {
                    for item in items {
                        build_const_pool(item, pool);
                    }
                }
            }
            Value::Closure { body, .. } => build_const_pool(body, pool),
            Value::Captured { .. } => {}
        },
        Node::RegularCall { args, .. } => {
            for arg in args {
                build_const_pool(arg, pool);
            }
        }
        Node::ValueCall { variable, args, .. } => {
            build_const_pool(variable, pool);
            for arg in args {
                build_const_pool(arg, pool);
            }
        }
        Node::Repetition { count, body, .. } => {
            build_const_pool(count, pool);
            build_const_pool(body, pool);
        }
    }
}

/// The i64 handle encoding of an integer literal (abi tag 00). Shared by
/// the inline-literal path and the const-pool prologue so both encodings
/// stay byte-for-byte identical.
fn int_handle(n: i64) -> i64 {
    abi::integer_to_value(n) as i64
}

/// The i64 handle encoding of a boolean literal (abi tag 01). See
/// [`int_handle`].
fn bool_handle(b: bool) -> i64 {
    abi::boolean_to_value(b) as i64
}

fn collect_uses(node: &Node, uses: &mut Uses) {
    match node {
        Node::Variable(..) => {}
        Node::Value(v, _) => match v {
            Value::Integer(_) | Value::Boolean(_) => {}
            Value::List(items) => {
                // Note on hoisting (plan §3.4): whether this list is
                // hoisted into the const pool or constructed inline, the
                // walk below registers exactly LIST_NEW — hoisting merely
                // moves the call into `__main`'s prologue (and hoisted
                // elements are pure literals, which register nothing
                // else). So `collect_uses` needs no pool knowledge: a
                // program whose ONLY list is hoisted still imports
                // LIST_NEW, and nothing new is ever registered for it.
                uses.rt.insert(abi::rt::LIST_NEW);
                for item in items {
                    collect_uses_lazy(item, uses);
                }
            }
            Value::Closure { body, .. } => {
                uses.rt.insert(abi::rt::CLOSURE_NEW);
                uses.rt.insert(abi::rt::ENV_NEW); // prologue
                collect_uses(body, uses);
            }
            Value::Captured { .. } => {
                uses.rt.insert(abi::rt::CAPTURE_NEW);
            }
        },
        Node::RegularCall { name, args, .. } => {
            // Plan §3.9: every regular call site is checkpointed (guardless
            // in measurement-only `--no-default-features` builds).
            #[cfg(feature = "checkpoints")]
            uses.rt.insert(abi::rt::CHECKPOINT);
            if let Some(def) = find_builtin(name, args.len() as u32) {
                uses.builtins.insert(def.import_name);
            }
            for arg in args {
                collect_uses_lazy(arg, uses);
            }
        }
        Node::ValueCall { variable, args, .. } => {
            // Plan §3.9: every value call site is checkpointed (after the
            // callee force, before the args are staged); guardless in
            // measurement-only `--no-default-features` builds.
            #[cfg(feature = "checkpoints")]
            uses.rt.insert(abi::rt::CHECKPOINT);
            uses.rt.insert(abi::rt::FORCE);
            uses.rt.insert(abi::rt::CALL_CALLABLE);
            if args.len() <= abi::ARGS_BUF_SLOTS {
                uses.rt.insert(abi::rt::ARGS_BUF);
            } else {
                uses.rt.insert(abi::rt::ENV_NEW); // oversized arg buffer
            }
            collect_uses(variable, uses);
            for arg in args {
                collect_uses_lazy(arg, uses);
            }
        }
        Node::Repetition { count, body, .. } => {
            // `#` is not a call in naive — no checkpoint of its own (plan
            // §3.9); the body's own call sites still collect one via the
            // arms above.
            uses.rt.insert(abi::rt::REPEAT);
            uses.rt.insert(abi::rt::CLOSURE_NEW); // 0-arity body closure
            uses.rt.insert(abi::rt::ENV_NEW); // its prologue
            collect_uses_lazy(count, uses);
            collect_uses(body, uses);
        }
    }
}

fn collect_uses_lazy(node: &Node, uses: &mut Uses) {
    if !is_direct(node) {
        uses.rt.insert(abi::rt::THUNK_NEW);
    }
    collect_uses(node, uses);
}

// ---------------------------------------------------------------------------
// Function-building context
// ---------------------------------------------------------------------------

/// Where the current environment pointer lives.
#[derive(Clone, Copy)]
enum EnvSlot {
    /// Top level: the env is the null pointer (0).
    Top,
    /// A local holding the env (param 0 for thunk bodies; a fresh local for
    /// closure bodies after the prologue).
    Local(u32),
}

struct FnCtx {
    instrs: Vec<Instruction<'static>>,
    /// Types of locals beyond the params (index space continues params).
    local_tys: Vec<ValType>,
    n_params: u32,
    env: EnvSlot,
    /// Scratch i64 local for the checkpoint guard (plan §3.9); allocated on
    /// demand, one per function (see `emit_checkpoint_guard` for why sharing
    /// one is safe). Unused in measurement-only `--no-default-features`
    /// builds (no guards are emitted there).
    #[cfg_attr(not(feature = "checkpoints"), allow(dead_code))]
    chk_local: Option<u32>,
    /// Lexical scope stack of closure parameter names (level 0 = top).
    scopes: Vec<Vec<String>>,
}

impl FnCtx {
    fn alloc_local(&mut self, ty: ValType) -> u32 {
        self.local_tys.push(ty);
        self.n_params + (self.local_tys.len() as u32 - 1)
    }

    fn emit_env(&mut self) {
        match self.env {
            EnvSlot::Top => self.instrs.push(Instruction::I32Const(0)),
            EnvSlot::Local(i) => self.instrs.push(Instruction::LocalGet(i)),
        }
    }
}

fn memarg(offset: u64) -> MemArg {
    MemArg { offset, align: 0, memory_index: 0 }
}

/// Convert a raw heap pointer (i32 on the stack) into a tagged value handle
/// (i64): `(byte_offset << 2) | TAG_HEAP`.
fn emit_tag_heap_ptr(instrs: &mut Vec<Instruction<'static>>) {
    instrs.push(Instruction::I64ExtendI32U);
    instrs.push(Instruction::I64Const(2));
    instrs.push(Instruction::I64Shl);
    instrs.push(Instruction::I64Const(abi::TAG_HEAP as i64));
    instrs.push(Instruction::I64Or);
}

// ---------------------------------------------------------------------------
// The codegen driver
// ---------------------------------------------------------------------------

struct DefFn {
    /// Whether this is a `$clo` function placed in the table (vs `__main`).
    is_clo: bool,
    local_tys: Vec<ValType>,
    instrs: Vec<Instruction<'static>>,
}

struct Codegen {
    /// Ordered rt import names; position = function index.
    rt_names: Vec<&'static str>,
    /// Ordered builtin import names; function index = rt_names.len() + pos.
    builtin_names: Vec<&'static str>,
    rt_idx: HashMap<&'static str, u32>,
    builtin_idx: HashMap<&'static str, u32>,
    /// Defined functions in emission order.
    defined: Vec<DefFn>,
    /// Positions in `defined` of `$clo` functions, in table-slot order.
    table: Vec<u32>,
    /// The interned const pool (plan §3.4); see [`ConstPool`].
    consts: ConstPool,
}

pub fn emit(root: &Node) -> Result<EmitResult, String> {
    let mut uses = Uses::default();
    collect_uses(root, &mut uses);

    // Assign import function indices deterministically: rt functions in
    // canonical order, then builtins sorted by import name.
    let rt_names: Vec<&'static str> =
        RT_ORDER.iter().copied().filter(|n| uses.rt.contains(*n)).collect();
    let builtin_names: Vec<&'static str> = uses.builtins.iter().copied().collect();
    let rt_idx: HashMap<&'static str, u32> =
        rt_names.iter().enumerate().map(|(i, n)| (*n, i as u32)).collect();
    let builtin_idx: HashMap<&'static str, u32> = builtin_names
        .iter()
        .enumerate()
        .map(|(i, n)| (*n, rt_names.len() as u32 + i as u32))
        .collect();

    let mut cg = Codegen {
        rt_names,
        builtin_names,
        rt_idx,
        builtin_idx,
        defined: Vec::new(),
        table: Vec::new(),
        consts: ConstPool::new(),
    };

    // Const-pool pre-pass (plan §3.4): intern every hoistable list constant
    // BEFORE emission — the prologue below must cover them all, and
    // emission-time lookups (including from thunk/closure bodies) rely on
    // completeness.
    build_const_pool(root, &mut cg.consts);

    // __main: () -> i64, env = top.
    let mut main = FnCtx {
        instrs: Vec::new(),
        local_tys: Vec::new(),
        n_params: 0,
        env: EnvSlot::Top,
        chk_local: None,
        scopes: vec![Vec::new()],
    };
    // Prologue first: initialize every const-pool global before any use.
    cg.emit_const_prologue(&mut main);
    cg.emit_value(&mut main, root)?;
    main.instrs.push(Instruction::End);
    let main_pos = cg.defined.len() as u32;
    cg.defined.push(DefFn { is_clo: false, local_tys: main.local_tys, instrs: main.instrs });

    cg.assemble(main_pos)
}

impl Codegen {
    fn rt(&self, name: &'static str) -> u32 {
        *self.rt_idx.get(name).expect("rt import collected")
    }

    fn builtin(&self, import_name: &'static str) -> u32 {
        *self.builtin_idx.get(import_name).expect("builtin import collected")
    }

    // -- function emission -------------------------------------------------

    /// Emit a thunk-body `$clo` function for `node`; returns its table slot.
    fn emit_thunk_fn(&mut self, node: &Node, scopes: &[Vec<String>]) -> Result<u32, String> {
        let mut ctx = FnCtx {
            instrs: Vec::new(),
            local_tys: Vec::new(),
            n_params: 3,
            env: EnvSlot::Local(0),
            chk_local: None,
            scopes: scopes.to_vec(),
        };
        self.emit_value(&mut ctx, node)?;
        ctx.instrs.push(Instruction::End);
        Ok(self.push_clo(ctx))
    }

    /// Emit a closure-body `$clo` function (prologue copies args into a fresh
    /// env); returns its table slot.
    fn emit_closure_fn(
        &mut self,
        params: &[(String, crate::ast::Span)],
        body: &Node,
        outer_scopes: &[Vec<String>],
    ) -> Result<u32, String> {
        let mut scopes = outer_scopes.to_vec();
        scopes.push(params.iter().map(|(n, _)| n.clone()).collect());
        let mut ctx = FnCtx {
            instrs: Vec::new(),
            local_tys: Vec::new(),
            n_params: 3,
            env: EnvSlot::Local(0),
            chk_local: None,
            scopes,
        };
        // Prologue: new_env = env_new(captured_env = param0, count = arity)
        let env_l = ctx.alloc_local(ValType::I32);
        ctx.instrs.push(Instruction::LocalGet(0));
        ctx.instrs.push(Instruction::I32Const(params.len() as i32));
        ctx.instrs.push(Instruction::Call(self.rt(abi::rt::ENV_NEW)));
        ctx.instrs.push(Instruction::LocalSet(env_l));
        // Copy args from args_ptr (param 1) into the fresh env (copy-on-entry).
        for i in 0..params.len() as u32 {
            ctx.instrs.push(Instruction::LocalGet(env_l));
            ctx.instrs.push(Instruction::LocalGet(1));
            ctx.instrs.push(Instruction::I64Load(memarg((i as u64) * 8)));
            ctx.instrs.push(Instruction::I64Store(memarg(layout::env_slot_offset(i))));
        }
        ctx.env = EnvSlot::Local(env_l);
        self.emit_value(&mut ctx, body)?;
        ctx.instrs.push(Instruction::End);
        Ok(self.push_clo(ctx))
    }

    fn push_clo(&mut self, ctx: FnCtx) -> u32 {
        let pos = self.defined.len() as u32;
        self.defined.push(DefFn { is_clo: true, local_tys: ctx.local_tys, instrs: ctx.instrs });
        let slot = self.table.len() as u32;
        self.table.push(pos);
        slot
    }

    // -- const-pool prologue --------------------------------------------------

    /// Emit `__main`'s const-pool prologue (plan §3.4): allocate every
    /// hoisted constant and store its handle into the pool's global.
    ///
    /// Entries are in inner-first order (see [`ConstPool`]), so a constant's
    /// nested-list elements `global.get` EARLIER, already-initialized
    /// globals. Element handles are inline i64 constants / child
    /// `global.get`s — byte-for-byte the encoding inline construction uses
    /// (same scalar helpers, same store offsets); hoisted constants contain
    /// no thunks.
    ///
    /// REUSE CONTRACT (v0.6 instance reuse, machine.ts `runPrepared`):
    /// `__main` is invoked repeatedly on ONE instance across samples, and
    /// `reset()` rewinds the heap between runs — the previous run's list
    /// handles are dead memory. Re-initializing every global here, at the
    /// top of every run and before any use, is what keeps that safe: all
    /// compiled code (thunk bodies, closure bodies) only ever runs within
    /// `__main`'s dynamic extent, so no code path can observe a global
    /// outside the run that initialized it.
    fn emit_const_prologue(&mut self, ctx: &mut FnCtx) {
        if self.consts.entries.is_empty() {
            return;
        }
        let list_new = self.rt(abi::rt::LIST_NEW);
        // One scratch pointer local, reused across all initializations
        // (each initialization completes before the next begins).
        let scratch = ctx.alloc_local(ValType::I32);
        for (i, c) in self.consts.entries.iter().enumerate() {
            let Const::List(elems) = c else {
                unreachable!("const-pool entries are lists by construction")
            };
            // list_new(len) -> raw pointer.
            ctx.instrs.push(Instruction::I32Const(elems.len() as i32));
            ctx.instrs.push(Instruction::Call(list_new));
            ctx.instrs.push(Instruction::LocalSet(scratch));
            for (j, e) in elems.iter().enumerate() {
                ctx.instrs.push(Instruction::LocalGet(scratch));
                match e {
                    Const::Int(n) => {
                        ctx.instrs.push(Instruction::I64Const(int_handle(*n)));
                    }
                    Const::Bool(b) => {
                        ctx.instrs.push(Instruction::I64Const(bool_handle(*b)));
                    }
                    Const::List(_) => {
                        ctx.instrs.push(Instruction::GlobalGet(self.consts.index_of(e)));
                    }
                }
                ctx.instrs.push(Instruction::I64Store(memarg(layout::list_elem_offset(
                    j as u32,
                ))));
            }
            // Tag the raw pointer into a heap handle; store into the global.
            ctx.instrs.push(Instruction::LocalGet(scratch));
            emit_tag_heap_ptr(&mut ctx.instrs);
            ctx.instrs.push(Instruction::GlobalSet(i as u32));
        }
    }

    // -- expression emission -------------------------------------------------

    /// Emit `body` (which must leave exactly one i64 on the stack) — under
    /// the plan-§3.9 checkpoint guard in normal builds; bare in
    /// `--no-default-features` measurement builds (the `checkpoints` cargo
    /// feature off: no guards are emitted and the CHECKPOINT import is
    /// omitted entirely; the soft timeout silently stops working — a
    /// measurement-only configuration, never for shipping).
    fn emit_guarded(
        &mut self,
        ctx: &mut FnCtx,
        body: impl FnOnce(&mut Self, &mut FnCtx) -> Result<(), String>,
    ) -> Result<(), String> {
        #[cfg(feature = "checkpoints")]
        {
            self.emit_checkpoint_guard(ctx, body)
        }
        #[cfg(not(feature = "checkpoints"))]
        {
            body(self, ctx)
        }
    }

    /// Emit the checkpoint guard (plan §3.9) around `body`, which must leave
    /// exactly one i64 on the stack:
    ///
    /// ```text
    /// call $checkpoint        // -> i64
    /// local.tee $chk
    /// i64.eqz
    /// if (result i64)
    ///   <body — leaves the call result i64>
    /// else
    ///   local.get $chk        // the error handle becomes this node's value
    /// end
    /// ```
    ///
    /// A fired checkpoint's ERROR handle thus becomes the call node's own
    /// value ("errors are values" — no traps), observationally identical to
    /// naive's lazy error box at the same call. One scratch i64 local per
    /// function is safe: the `else` arm reads `$chk` only when the `then` arm
    /// (whose nested calls may clobber `$chk`) was skipped.
    #[cfg(feature = "checkpoints")]
    fn emit_checkpoint_guard(
        &mut self,
        ctx: &mut FnCtx,
        body: impl FnOnce(&mut Self, &mut FnCtx) -> Result<(), String>,
    ) -> Result<(), String> {
        let chk = match ctx.chk_local {
            Some(l) => l,
            None => {
                let l = ctx.alloc_local(ValType::I64);
                ctx.chk_local = Some(l);
                l
            }
        };
        ctx.instrs.push(Instruction::Call(self.rt(abi::rt::CHECKPOINT)));
        ctx.instrs.push(Instruction::LocalTee(chk));
        ctx.instrs.push(Instruction::I64Eqz);
        ctx.instrs.push(Instruction::If(BlockType::Result(ValType::I64)));
        body(self, ctx)?;
        ctx.instrs.push(Instruction::Else);
        ctx.instrs.push(Instruction::LocalGet(chk));
        ctx.instrs.push(Instruction::End);
        Ok(())
    }

    /// Emit code leaving a value handle for `node` (calls are performed).
    fn emit_value(&mut self, ctx: &mut FnCtx, node: &Node) -> Result<(), String> {
        match node {
            Node::Variable(name, _) => {
                let (depth, slot) = resolve(&ctx.scopes, name)
                    .ok_or_else(|| format!("unresolved variable {name} in codegen"))?;
                ctx.emit_env();
                for _ in 0..depth {
                    ctx.instrs.push(Instruction::I32Load(memarg(layout::ENV_PARENT_OFFSET)));
                }
                ctx.instrs.push(Instruction::I64Load(memarg(layout::env_slot_offset(slot))));
            }
            Node::Value(v, _) => match v {
                Value::Integer(n) => {
                    ctx.instrs.push(Instruction::I64Const(int_handle(*n)));
                }
                Value::Boolean(b) => {
                    ctx.instrs.push(Instruction::I64Const(bool_handle(*b)));
                }
                Value::List(items) => {
                    // Const-pool hoisting (plan §3.4): a literal list whose
                    // elements are recursively pure literals — Integer,
                    // Boolean, or another such list; nothing else (no calls,
                    // variables, closures, captures) — is allocated once
                    // per DISTINCT constant in `__main`'s prologue, and
                    // every occurrence compiles to one `global.get`.
                    //
                    // Safety of sharing one heap list across occurrences:
                    // - Immutability: lists are never mutated after
                    //   construction — every `values::list_set` call site
                    //   in nova-builtins (builtins.rs, seq.rs) writes into
                    //   a list freshly allocated by `list_new[_fallible]`
                    //   in the same function (audited 2026-10); the only
                    //   other element writes are these compiler-emitted
                    //   construction stores, which complete before the
                    //   handle escapes.
                    // - Eagerness unchanged: literal lists are `is_direct`
                    //   values (constructed eagerly, never thunked), so a
                    //   pre-allocated global handle is observationally
                    //   identical.
                    // - Thunk memoization unaffected: hoisted constants
                    //   contain no thunks (elements are inline scalar
                    //   handles / child-list handles, exactly as inline
                    //   construction encodes them).
                    if let Some(elems) = items.iter().map(classify_const).collect::<Option<Vec<_>>>()
                    {
                        let g = self.consts.index_of(&Const::List(elems));
                        ctx.instrs.push(Instruction::GlobalGet(g));
                    } else {
                        let l = ctx.alloc_local(ValType::I32);
                        ctx.instrs.push(Instruction::I32Const(items.len() as i32));
                        ctx.instrs.push(Instruction::Call(self.rt(abi::rt::LIST_NEW)));
                        ctx.instrs.push(Instruction::LocalSet(l));
                        for (i, item) in items.iter().enumerate() {
                            ctx.instrs.push(Instruction::LocalGet(l));
                            self.emit_lazy(ctx, item)?;
                            ctx.instrs.push(Instruction::I64Store(memarg(
                                layout::list_elem_offset(i as u32),
                            )));
                        }
                        // list_new returns a raw pointer; tag it into a handle.
                        ctx.instrs.push(Instruction::LocalGet(l));
                        emit_tag_heap_ptr(&mut ctx.instrs);
                    }
                }
                Value::Closure { params, body } => {
                    let slot = self.emit_closure_fn(params, body, &ctx.scopes)?;
                    ctx.instrs.push(Instruction::I32Const(slot as i32));
                    ctx.emit_env();
                    ctx.instrs.push(Instruction::I32Const(params.len() as i32));
                    ctx.instrs.push(Instruction::Call(self.rt(abi::rt::CLOSURE_NEW)));
                }
                Value::Captured { identifier, arity } => {
                    let def = find_builtin(identifier, *arity as u32).ok_or_else(|| {
                        format!("unresolved capture {identifier}/{arity} in codegen")
                    })?;
                    ctx.instrs.push(Instruction::I32Const(def.id as i32));
                    ctx.instrs.push(Instruction::I32Const(def.arity as i32));
                    ctx.instrs.push(Instruction::Call(self.rt(abi::rt::CAPTURE_NEW)));
                }
            },
            Node::RegularCall { name, args, .. } => {
                let def = find_builtin(name, args.len() as u32).ok_or_else(|| {
                    format!("unresolved call {name}/{len} in codegen", len = args.len())
                })?;
                // Checkpoint before arg creation: arg-thunk creation is
                // forcing-free allocation, unobservable (plan §3.9).
                self.emit_guarded(ctx, |cg, ctx| {
                    for arg in args {
                        cg.emit_lazy(ctx, arg)?;
                    }
                    ctx.instrs.push(Instruction::Call(cg.builtin(def.import_name)));
                    Ok(())
                })?;
            }
            Node::ValueCall { variable, args, .. } => {
                let f = ctx.alloc_local(ValType::I64);
                let buf = ctx.alloc_local(ValType::I32);
                // Force the callee FIRST (naive forces the callee eagerly
                // before checkpointing; forcing may also run code that
                // clobbers the scratch args buffer).
                self.emit_value(ctx, variable)?;
                ctx.instrs.push(Instruction::Call(self.rt(abi::rt::FORCE)));
                ctx.instrs.push(Instruction::LocalSet(f));
                let argc = args.len() as u32;
                // The checkpoint sits after the callee force, wrapping the
                // args staging + dispatch (plan §3.9, naive parity).
                self.emit_guarded(ctx, |cg, ctx| {
                    if args.len() <= abi::ARGS_BUF_SLOTS {
                        ctx.instrs.push(Instruction::Call(cg.rt(abi::rt::ARGS_BUF)));
                    } else {
                        // Oversized call: use a fresh env as the arg buffer.
                        ctx.instrs.push(Instruction::I32Const(0));
                        ctx.instrs.push(Instruction::I32Const(argc as i32));
                        ctx.instrs.push(Instruction::Call(cg.rt(abi::rt::ENV_NEW)));
                    }
                    ctx.instrs.push(Instruction::LocalSet(buf));
                    for (i, arg) in args.iter().enumerate() {
                        ctx.instrs.push(Instruction::LocalGet(buf));
                        cg.emit_lazy(ctx, arg)?;
                        ctx.instrs.push(Instruction::I64Store(memarg((i as u64) * 8)));
                    }
                    ctx.instrs.push(Instruction::LocalGet(f));
                    ctx.instrs.push(Instruction::LocalGet(buf));
                    ctx.instrs.push(Instruction::I32Const(argc as i32));
                    ctx.instrs.push(Instruction::Call(cg.rt(abi::rt::CALL_CALLABLE)));
                    Ok(())
                })?;
            }
            Node::Repetition { count, body, .. } => {
                self.emit_lazy(ctx, count)?;
                let slot = self.emit_closure_fn(&[], body, &ctx.scopes)?;
                ctx.instrs.push(Instruction::I32Const(slot as i32));
                ctx.emit_env();
                ctx.instrs.push(Instruction::I32Const(0));
                ctx.instrs.push(Instruction::Call(self.rt(abi::rt::CLOSURE_NEW)));
                ctx.instrs.push(Instruction::Call(self.rt(abi::rt::REPEAT)));
            }
        }
        Ok(())
    }

    /// Emit code leaving a *lazy* handle for `node` (thunk-wrapped unless the
    /// node is already a value).
    fn emit_lazy(&mut self, ctx: &mut FnCtx, node: &Node) -> Result<(), String> {
        if is_direct(node) {
            self.emit_value(ctx, node)
        } else {
            let slot = self.emit_thunk_fn(node, &ctx.scopes)?;
            ctx.instrs.push(Instruction::I32Const(slot as i32));
            ctx.emit_env();
            ctx.instrs.push(Instruction::Call(self.rt(abi::rt::THUNK_NEW)));
            Ok(())
        }
    }

    // -- module assembly -----------------------------------------------------

    fn assemble(self, main_pos: u32) -> Result<EmitResult, String> {
        let table_size = self.table.len() as u32;

        // --- types (interned) ----------------------------------------------
        let mut types = TypeSection::new();
        let mut type_map: HashMap<(Vec<ValType>, Vec<ValType>), u32> = HashMap::new();
        let mut intern = |types: &mut TypeSection, p: &[ValType], r: &[ValType]| {
            let key = (p.to_vec(), r.to_vec());
            if let Some(i) = type_map.get(&key) {
                return *i;
            }
            let i = type_map.len() as u32;
            types.ty().function(p.iter().copied(), r.iter().copied());
            type_map.insert(key, i);
            i
        };

        let clo_ty = intern(&mut types, &[ValType::I32, ValType::I32, ValType::I32], &[ValType::I64]);
        let main_ty = intern(&mut types, &[], &[ValType::I64]);

        // Import types, in the same order indices were assigned.
        let mut import_tys: Vec<u32> = Vec::new();
        for name in &self.rt_names {
            let (p, r) = rt_signature(name);
            import_tys.push(intern(&mut types, p, r));
        }
        for name in &self.builtin_names {
            let def = abi::BUILTINS
                .iter()
                .find(|d| d.import_name == *name)
                .ok_or_else(|| format!("unknown builtin import {name}"))?;
            let params = vec![ValType::I64; def.arity as usize];
            import_tys.push(intern(&mut types, &params, &[ValType::I64]));
        }

        // --- imports ---------------------------------------------------------
        let mut imports = ImportSection::new();
        imports.import(
            ENV_MODULE,
            abi::env::MEMORY,
            EntityType::Memory(MemoryType {
                minimum: 1,
                maximum: None,
                memory64: false,
                shared: false,
                page_size_log2: None,
            }),
        );
        imports.import(
            ENV_MODULE,
            abi::env::TABLE,
            EntityType::Table(TableType {
                element_type: RefType::FUNCREF,
                table64: false,
                minimum: table_size as u64,
                maximum: None,
                shared: false,
            }),
        );
        let import_names: Vec<&str> =
            self.rt_names.iter().copied().chain(self.builtin_names.iter().copied()).collect();
        for (name, ty) in import_names.iter().zip(import_tys.iter()) {
            imports.import(abi::RUNTIME_IMPORT_MODULE, name, EntityType::Function(*ty));
        }

        // --- functions --------------------------------------------------------
        let mut functions = FunctionSection::new();
        for f in &self.defined {
            functions.function(if f.is_clo { clo_ty } else { main_ty });
        }

        // --- globals (const pool, plan §3.4) ----------------------------------
        // One mutable i64 global per hoisted constant, initialized to the
        // null value handle (0). `__main`'s prologue re-initializes them at
        // the start of EVERY run (see `emit_const_prologue`'s reuse
        // contract — machine.ts's instance reuse depends on it).
        let mut globals = GlobalSection::new();
        for _ in &self.consts.entries {
            globals.global(
                GlobalType { val_type: ValType::I64, mutable: true, shared: false },
                &ConstExpr::i64_const(0),
            );
        }

        // --- exports -----------------------------------------------------------
        let n_import_fns = (self.rt_names.len() + self.builtin_names.len()) as u32;
        let mut exports = ExportSection::new();
        exports.export("__main", ExportKind::Func, n_import_fns + main_pos);

        // --- elements ----------------------------------------------------------
        let mut elements = ElementSection::new();
        if !self.table.is_empty() {
            let funcs: Vec<u32> = self.table.iter().map(|pos| n_import_fns + pos).collect();
            elements.active(
                Some(0),
                &ConstExpr::i32_const(0),
                Elements::Functions(std::borrow::Cow::Owned(funcs)),
            );
        }

        // --- code ---------------------------------------------------------------
        let mut code = CodeSection::new();
        for f in &self.defined {
            // Coalesce consecutive same-type locals into runs.
            let mut runs: Vec<(u32, ValType)> = Vec::new();
            for ty in &f.local_tys {
                if let Some(last) = runs.last_mut() {
                    if last.1 == *ty {
                        last.0 += 1;
                        continue;
                    }
                }
                runs.push((1, *ty));
            }
            let mut func = Function::new(runs);
            for ins in &f.instrs {
                func.instruction(ins);
            }
            code.function(&func);
        }

        let mut module = Module::new();
        module.section(&types);
        module.section(&imports);
        module.section(&functions);
        // Globals sit between the function and export sections (canonical
        // section order); skipped entirely when nothing is hoisted, so
        // hoist-free programs emit byte-identical modules to before.
        if !globals.is_empty() {
            module.section(&globals);
        }
        module.section(&exports);
        module.section(&elements);
        module.section(&code);
        let wasm_bytes = module.finish();

        Ok(EmitResult { wasm_bytes, table_size })
    }
}

/// Resolve a variable to (depth, slot) against the scope stack.
fn resolve(scopes: &[Vec<String>], name: &str) -> Option<(u32, u32)> {
    for (i, level) in scopes.iter().enumerate().rev() {
        if let Some(slot) = level.iter().position(|p| p == name) {
            return Some(((scopes.len() - 1 - i) as u32, slot as u32));
        }
    }
    None
}
