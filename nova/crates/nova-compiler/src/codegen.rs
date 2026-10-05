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

use std::collections::{BTreeSet, HashMap};

use dicexp_nova_abi::{self as abi, find_builtin};
use wasm_encoder::{
    CodeSection, ConstExpr, ElementSection, Elements, EntityType, ExportKind, ExportSection,
    Function, FunctionSection, ImportSection, Instruction, MemArg, MemoryType, Module, RefType,
    TableType, TypeSection, ValType,
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
const RT_ORDER: [&str; 9] = [
    abi::rt::THUNK_NEW,
    abi::rt::FORCE,
    abi::rt::CLOSURE_NEW,
    abi::rt::CAPTURE_NEW,
    abi::rt::ENV_NEW,
    abi::rt::LIST_NEW,
    abi::rt::ARGS_BUF,
    abi::rt::CALL_CALLABLE,
    abi::rt::REPEAT,
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

fn collect_uses(node: &Node, uses: &mut Uses) {
    match node {
        Node::Variable(..) => {}
        Node::Value(v, _) => match v {
            Value::Integer(_) | Value::Boolean(_) => {}
            Value::List(items) => {
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
            if let Some(def) = find_builtin(name, args.len() as u32) {
                uses.builtins.insert(def.import_name);
            }
            for arg in args {
                collect_uses_lazy(arg, uses);
            }
        }
        Node::ValueCall { variable, args, .. } => {
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
    };

    // __main: () -> i64, env = top.
    let mut main = FnCtx {
        instrs: Vec::new(),
        local_tys: Vec::new(),
        n_params: 0,
        env: EnvSlot::Top,
        scopes: vec![Vec::new()],
    };
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

    // -- expression emission -------------------------------------------------

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
                    ctx.instrs.push(Instruction::I64Const(n << 2));
                }
                Value::Boolean(b) => {
                    let v: i64 = if *b { 5 } else { 1 };
                    ctx.instrs.push(Instruction::I64Const(v));
                }
                Value::List(items) => {
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
                for arg in args {
                    self.emit_lazy(ctx, arg)?;
                }
                ctx.instrs.push(Instruction::Call(self.builtin(def.import_name)));
            }
            Node::ValueCall { variable, args, .. } => {
                let f = ctx.alloc_local(ValType::I64);
                let buf = ctx.alloc_local(ValType::I32);
                // Force the callee FIRST (forcing may run code that clobbers
                // the scratch args buffer).
                self.emit_value(ctx, variable)?;
                ctx.instrs.push(Instruction::Call(self.rt(abi::rt::FORCE)));
                ctx.instrs.push(Instruction::LocalSet(f));
                let argc = args.len() as u32;
                if args.len() <= abi::ARGS_BUF_SLOTS {
                    ctx.instrs.push(Instruction::Call(self.rt(abi::rt::ARGS_BUF)));
                } else {
                    // Oversized call: use a fresh env as the arg buffer.
                    ctx.instrs.push(Instruction::I32Const(0));
                    ctx.instrs.push(Instruction::I32Const(argc as i32));
                    ctx.instrs.push(Instruction::Call(self.rt(abi::rt::ENV_NEW)));
                }
                ctx.instrs.push(Instruction::LocalSet(buf));
                for (i, arg) in args.iter().enumerate() {
                    ctx.instrs.push(Instruction::LocalGet(buf));
                    self.emit_lazy(ctx, arg)?;
                    ctx.instrs.push(Instruction::I64Store(memarg((i as u64) * 8)));
                }
                ctx.instrs.push(Instruction::LocalGet(f));
                ctx.instrs.push(Instruction::LocalGet(buf));
                ctx.instrs.push(Instruction::I32Const(argc as i32));
                ctx.instrs.push(Instruction::Call(self.rt(abi::rt::CALL_CALLABLE)));
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
