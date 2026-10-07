//! ABI specification shared by the dicexp-nova compiler and builtins.
//!
//! Source of truth (prose): `nova/docs/plan.md` §3.
//! Anything that crosses the boundary between the emitted program module and
//! the builtins module is defined here.

// ---------------------------------------------------------------------------
// Values (u64 handles)
// ---------------------------------------------------------------------------

/// Low 2 bits of a value handle are the tag.
pub const TAG_MASK: u64 = 0b11;
pub const TAG_INTEGER: u64 = 0b00;
pub const TAG_BOOLEAN: u64 = 0b01;
pub const TAG_HEAP: u64 = 0b10;

/// dicexp integers are restricted to ±(2^53 − 1).
pub const MAX_SAFE_INTEGER: i64 = 9007199254740991;
pub const MIN_SAFE_INTEGER: i64 = -9007199254740991;

pub const fn integer_to_value(v: i64) -> u64 {
    ((v as u64) << 2) | TAG_INTEGER
}
pub const fn value_to_integer(v: u64) -> i64 {
    (v as i64) >> 2
}
pub const fn boolean_to_value(b: bool) -> u64 {
    ((b as u64) << 2) | TAG_BOOLEAN
}
pub const fn value_to_boolean(v: u64) -> bool {
    (v >> 2) != 0
}
pub const fn heap_ptr_to_value(byte_offset: u32) -> u64 {
    ((byte_offset as u64) << 2) | TAG_HEAP
}
pub const fn value_to_heap_ptr(v: u64) -> u32 {
    (v >> 2) as u32
}
pub const fn value_tag(v: u64) -> u64 {
    v & TAG_MASK
}

// ---------------------------------------------------------------------------
// Heap object kinds (header: { kind: u8, flags: u8, _reserved: u16, len: u32 })
// ---------------------------------------------------------------------------

pub mod kind {
    pub const THUNK: u8 = 1;
    pub const CLOSURE: u8 = 2;
    pub const CAPTURE: u8 = 3;
    pub const ENV: u8 = 4;
    pub const LIST: u8 = 5;
    pub const ERROR: u8 = 6;
    pub const STRING: u8 = 7;
    pub const SEQUENCE: u8 = 8;
}

/// For SEQUENCE objects: `flags & SEQUENCE_FLAG_SUM` marks `sequence$sum`.
pub const SEQUENCE_FLAG_SUM: u8 = 1;

/// Thunk states.
pub mod thunk_state {
    pub const UNEVALUATED: u8 = 0;
    pub const DONE: u8 = 2;
    pub const ERROR: u8 = 3;
}

// ---------------------------------------------------------------------------
// Value types (mirrors naive's ValueTypeName; used in error params)
// ---------------------------------------------------------------------------

pub mod value_type {
    pub const INTEGER: u8 = 0;
    pub const BOOLEAN: u8 = 1;
    pub const LIST: u8 = 2;
    pub const CALLABLE: u8 = 3;
    pub const SEQUENCE: u8 = 4;
    pub const SEQUENCE_SUM: u8 = 5;

    pub const fn set_mask(types: &[u8]) -> u8 {
        let mut mask = 0u8;
        let mut i = 0;
        while i < types.len() {
            mask |= 1 << types[i];
            i += 1;
        }
        mask
    }
}

/// Param tags (for ERROR objects and the result wire format).
pub mod param_tag {
    pub const INT: u8 = 0;
    pub const STRING: u8 = 1; // heap ptr to a kind::STRING object
    pub const VALUE_TYPE: u8 = 2;
    pub const VALUE_TYPE_SET: u8 = 3; // bitmask of value_type
}

// ---------------------------------------------------------------------------
// Error keys
// ---------------------------------------------------------------------------
//
// Ranges: 1..=999 runtime (produced by builtins),
//         1000..=1999 compile-time semantic errors (produced by the compiler),
//         2000..=2999 parse errors (produced by the compiler).

pub mod error_key {
    // --- runtime (builtins) ---
    /// params: [int max]
    pub const LIMITATION_EXCEEDED_MAX_SAFE_INTEGER: u32 = 1;
    /// params: [int min]
    pub const LIMITATION_EXCEEDED_MIN_SAFE_INTEGER: u32 = 2;
    /// params: [int ms]
    pub const RESTRICTION_EXCEEDED_SOFT_TIMEOUT: u32 = 3;
    /// params: [int expected, int actual]
    pub const WRONG_ARITY_REGULAR: u32 = 10;
    /// params: [int expected, int actual]
    pub const WRONG_ARITY_CLOSURE: u32 = 11;
    /// params: [int expected, int actual]
    pub const WRONG_ARITY_CAPTURED: u32 = 12;
    /// params: [typeset expected, valtype actual, int kind]
    /// kind: 0 = none, 1 = "list-inconsistency"
    pub const TYPE_MISMATCH: u32 = 20;
    /// params: [int position, typeset expected, valtype actual]
    pub const CALL_ARGUMENT_TYPE_MISMATCH: u32 = 21;
    /// params: []
    pub const VALUE_IS_NOT_CALLABLE: u32 = 22;
    /// params: [valtype actual]
    pub const BAD_FINAL_RESULT: u32 = 23;
    /// params: [string rendered_operation]
    pub const ILLEGAL_OPERATION_DIV_BY_ZERO: u32 = 30;
    /// params: [string rendered_operation]
    pub const ILLEGAL_OPERATION_MOD_NEGATIVE_DIVIDEND: u32 = 31;
    /// params: [string rendered_operation]
    pub const ILLEGAL_OPERATION_MOD_NON_POSITIVE_DIVISOR: u32 = 32;
    /// params: [string rendered_operation]
    pub const ILLEGAL_OPERATION_POW_NEGATIVE_EXPONENT: u32 = 33;
    /// params: [string rendered_operation, int min, int actual]
    pub const ILLEGAL_OPERATION_RANGE_UPPER_BOUND: u32 = 34;
    /// params: []
    pub const MEMORY_LIMIT_EXCEEDED: u32 = 40;
    // 41 is retired: it was the temporary stub key for builtins before they
    // were implemented (`reroll/2`, `explode/2`; removed in v0.4). Keys are
    // ABI-stable — never reassign this id.
    /// params: [string rendered_operation] (`==` / `!=` with different operand types)
    pub const ILLEGAL_OPERATION_LR_TYPE_MISMATCH: u32 = 42;
    /// params: [int list_len, int index]
    pub const AT_INDEX_OUT_OF_BOUNDS: u32 = 43;
    /// params: [] (head/tail of an empty list)
    pub const EMPTY_LIST: u32 = 44;
    /// params: [] (sum/product)
    pub const LIST_HAS_NON_INTEGER_ITEM: u32 = 45;
    /// params: [] (any?)
    pub const LIST_HAS_NON_BOOLEAN_ITEM: u32 = 46;
    /// params: [] (sort)
    pub const LIST_NOT_SORTABLE: u32 = 47;
    /// params: [int position, string name, valtype expected, valtype actual]
    pub const CLOSURE_RETURN_TYPE_MISMATCH: u32 = 48;
    /// params: [valtype actual] (`#` count)
    pub const REPEAT_COUNT_TYPE_MISMATCH: u32 = 49;
    /// params: [] (`has?` scan hit a non-integer/non-boolean element;
    /// zh: 传入的列表存在非「整数或布尔」项)
    pub const LIST_HAS_NON_SCALAR_ITEM: u32 = 50;
    /// params: [valtype actual] (unfold step returned neither `false` nor a
    /// list; zh: 传入 unfold/2 的闭包的返回值类型与期待不符：…)
    pub const UNFOLD_STEP_TYPE_MISMATCH: u32 = 51;
    /// params: [int actual_len] (unfold step list had ≠ 2 elements;
    /// zh: 传入 unfold/2 的闭包返回的列表应含两个元素，实际含 N 个。)
    pub const UNFOLD_STEP_LIST_LENGTH_MISMATCH: u32 = 52;

    // --- compile-time semantic errors (compiler) ---
    /// params: [string name]
    pub const UNKNOWN_REGULAR_FUNCTION: u32 = 1000;
    /// params: [string name]
    pub const UNKNOWN_VARIABLE: u32 = 1001;
    /// params: [string name]
    pub const DUPLICATE_CLOSURE_PARAMETER_NAMES: u32 = 1002;

    // --- parse errors (compiler) ---
    /// params: []
    pub const PARSE_SYNTAX_ERROR: u32 = 2000;
    /// params: [] (found `/`; dicexp only has integer division `//`)
    pub const PARSE_SLASH_SUGGEST_DIV: u32 = 2001;
    /// params: [string literal] (integer literal out of the safe range)
    pub const PARSE_INTEGER_LITERAL_TOO_LARGE: u32 = 2002;
    /// params: [] (pipe target cannot receive arguments)
    pub const PARSE_BAD_PIPE_TARGET: u32 = 2003;
}

// ---------------------------------------------------------------------------
// Builtins
// ---------------------------------------------------------------------------

/// How a builtin parameter is passed. Everything crosses the ABI as a value
/// handle (usually an unevaluated thunk); `Lazy` means the implementation
/// itself decides when/whether to force it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Param {
    Eager,
    Lazy,
}

/// Static description of one builtin (one name/arity pair).
pub struct BuiltinDef {
    /// Numeric id (indexes the capture-dispatch table in builtins).
    pub id: u32,
    /// dicexp-level name, e.g. "+", "map", "zipWith".
    pub name: &'static str,
    pub arity: u32,
    /// Exported name in the builtins module / imported name in program
    /// modules (module `nova_rt`).
    pub import_name: &'static str,
    pub params: &'static [Param],
}

const E: Param = Param::Eager;
const L: Param = Param::Lazy;

/// All builtins. MUST stay sorted by id; ids are ABI-stable.
pub static BUILTINS: &[BuiltinDef] = &[
    // --- operators (arithmetic) ---
    BuiltinDef { id: 0,  name: "+",  arity: 2, import_name: "op_add_2",   params: &[E, E] },
    BuiltinDef { id: 1,  name: "-",  arity: 2, import_name: "op_sub_2",   params: &[E, E] },
    BuiltinDef { id: 2,  name: "*",  arity: 2, import_name: "op_mul_2",   params: &[E, E] },
    BuiltinDef { id: 3,  name: "//", arity: 2, import_name: "op_div_2",   params: &[E, E] },
    BuiltinDef { id: 4,  name: "%",  arity: 2, import_name: "op_mod_2",   params: &[E, E] },
    BuiltinDef { id: 5,  name: "**", arity: 2, import_name: "op_pow_2",   params: &[E, E] },
    BuiltinDef { id: 6,  name: "+",  arity: 1, import_name: "op_pos_1",   params: &[E] },
    BuiltinDef { id: 7,  name: "-",  arity: 1, import_name: "op_neg_1",   params: &[E] },
    // --- operators (equality / comparison) ---
    BuiltinDef { id: 8,  name: "==", arity: 2, import_name: "op_eq_2",    params: &[E, E] },
    BuiltinDef { id: 9,  name: "!=", arity: 2, import_name: "op_ne_2",    params: &[E, E] },
    BuiltinDef { id: 10, name: "<",  arity: 2, import_name: "op_lt_2",    params: &[E, E] },
    BuiltinDef { id: 11, name: ">",  arity: 2, import_name: "op_gt_2",    params: &[E, E] },
    BuiltinDef { id: 12, name: "<=", arity: 2, import_name: "op_le_2",    params: &[E, E] },
    BuiltinDef { id: 13, name: ">=", arity: 2, import_name: "op_ge_2",    params: &[E, E] },
    // --- operators (logic; second param is lazy → short-circuit, see compat.md) ---
    BuiltinDef { id: 14, name: "and", arity: 2, import_name: "op_and_2",  params: &[E, L] },
    BuiltinDef { id: 15, name: "or",  arity: 2, import_name: "op_or_2",   params: &[E, L] },
    BuiltinDef { id: 16, name: "not", arity: 1, import_name: "op_not_1",  params: &[E] },
    // --- operators (dice) ---
    BuiltinDef { id: 17, name: "d",   arity: 1, import_name: "op_d_1",    params: &[E] },
    BuiltinDef { id: 18, name: "d",   arity: 2, import_name: "op_d_2",    params: &[E, E] },
    BuiltinDef { id: 19, name: "~",   arity: 1, import_name: "op_range_1", params: &[E] },
    BuiltinDef { id: 20, name: "~",   arity: 2, import_name: "op_range_2", params: &[E, E] },
    // --- functions (dice) ---
    BuiltinDef { id: 21, name: "reroll",  arity: 2, import_name: "bf_reroll_2",  params: &[E, E] },
    BuiltinDef { id: 22, name: "explode", arity: 2, import_name: "bf_explode_2", params: &[E, E] },
    // --- functions (utility) ---
    BuiltinDef { id: 23, name: "count",   arity: 2, import_name: "bf_count_2",   params: &[E, E] },
    BuiltinDef { id: 24, name: "sum",     arity: 1, import_name: "bf_sum_1",     params: &[E] },
    BuiltinDef { id: 25, name: "product", arity: 1, import_name: "bf_product_1", params: &[E] },
    BuiltinDef { id: 26, name: "any?",    arity: 1, import_name: "bf_any_1",     params: &[E] },
    BuiltinDef { id: 27, name: "sort",    arity: 1, import_name: "bf_sort_1",    params: &[E] },
    BuiltinDef { id: 28, name: "append",  arity: 2, import_name: "bf_append_2",  params: &[E, L] },
    BuiltinDef { id: 29, name: "at",      arity: 2, import_name: "bf_at_2",      params: &[E, E] },
    // --- functions (functional) ---
    BuiltinDef { id: 30, name: "map",     arity: 2, import_name: "bf_map_2",     params: &[E, E] },
    BuiltinDef { id: 31, name: "filter",  arity: 2, import_name: "bf_filter_2",  params: &[E, E] },
    BuiltinDef { id: 32, name: "head",    arity: 1, import_name: "bf_head_1",    params: &[E] },
    BuiltinDef { id: 33, name: "tail",    arity: 1, import_name: "bf_tail_1",    params: &[E] },
    BuiltinDef { id: 34, name: "zip",     arity: 2, import_name: "bf_zip_2",     params: &[E, E] },
    BuiltinDef { id: 35, name: "zipWith", arity: 3, import_name: "bf_zipWith_3", params: &[E, E, E] },
    // --- v0.7 additions (contracts: nova/docs/v0.7-contracts.md) ---
    BuiltinDef { id: 36, name: "abs",        arity: 1, import_name: "bf_abs_1",        params: &[E] },
    BuiltinDef { id: 37, name: "count",      arity: 1, import_name: "bf_count_1",      params: &[E] },
    BuiltinDef { id: 38, name: "has?",       arity: 2, import_name: "bf_has_2",        params: &[E, E] },
    BuiltinDef { id: 39, name: "min",        arity: 1, import_name: "bf_min_1",        params: &[E] },
    BuiltinDef { id: 40, name: "max",        arity: 1, import_name: "bf_max_1",        params: &[E] },
    BuiltinDef { id: 41, name: "all?",       arity: 1, import_name: "bf_all_1",        params: &[E] },
    BuiltinDef { id: 42, name: "sort",       arity: 2, import_name: "bf_sort_2",       params: &[E, E] },
    BuiltinDef { id: 43, name: "reverse",    arity: 1, import_name: "bf_reverse_1",    params: &[E] },
    BuiltinDef { id: 44, name: "concat",     arity: 2, import_name: "bf_concat_2",     params: &[E, E] },
    BuiltinDef { id: 45, name: "prepend",    arity: 2, import_name: "bf_prepend_2",    params: &[E, L] },
    BuiltinDef { id: 46, name: "at",         arity: 3, import_name: "bf_at_3",         params: &[E, E, L] },
    BuiltinDef { id: 47, name: "duplicate",  arity: 2, import_name: "bf_duplicate_2",  params: &[L, E] },
    BuiltinDef { id: 48, name: "flatten",    arity: 2, import_name: "bf_flatten_2",    params: &[E, E] },
    BuiltinDef { id: 49, name: "flattenAll", arity: 1, import_name: "bf_flattenAll_1", params: &[E] },
    BuiltinDef { id: 50, name: "flatMap",    arity: 2, import_name: "bf_flatMap_2",    params: &[E, E] },
    BuiltinDef { id: 51, name: "foldl",      arity: 3, import_name: "bf_foldl_3",      params: &[E, L, E] },
    BuiltinDef { id: 52, name: "foldr",      arity: 3, import_name: "bf_foldr_3",      params: &[E, L, E] },
    BuiltinDef { id: 53, name: "unfold",     arity: 2, import_name: "bf_unfold_2",     params: &[L, E] },
    BuiltinDef { id: 54, name: "iterate",    arity: 2, import_name: "bf_iterate_2",    params: &[L, E] },
    BuiltinDef { id: 55, name: "last",       arity: 1, import_name: "bf_last_1",       params: &[E] },
    BuiltinDef { id: 56, name: "init",       arity: 1, import_name: "bf_init_1",       params: &[E] },
    BuiltinDef { id: 57, name: "take",       arity: 2, import_name: "bf_take_2",       params: &[E, E] },
    BuiltinDef { id: 58, name: "takeWhile",  arity: 2, import_name: "bf_takeWhile_2",  params: &[E, E] },
    BuiltinDef { id: 59, name: "drop",       arity: 2, import_name: "bf_drop_2",       params: &[E, E] },
    BuiltinDef { id: 60, name: "dropWhile",  arity: 2, import_name: "bf_dropWhile_2",  params: &[E, E] },
];

/// Compile-time alias resolution (e.g. `^/2` → `**/2`), mirroring naive's
/// scope-level aliases with identical observable behavior.
pub fn resolve_alias(name: &str, arity: u32) -> Option<(&'static str, u32)> {
    match (name, arity) {
        ("^", 2) => Some(("**", 2)),
        _ => None,
    }
}

/// Look up a builtin by dicexp name and arity (aliases resolved).
pub fn find_builtin(name: &str, arity: u32) -> Option<&'static BuiltinDef> {
    let (name, arity) = resolve_alias(name, arity).unwrap_or((name, arity));
    BUILTINS.iter().find(|d| d.name == name && d.arity == arity)
}

/// Look up a builtin by numeric id (for capture dispatch).
pub fn find_builtin_by_id(id: u32) -> Option<&'static BuiltinDef> {
    BUILTINS.get(id as usize).filter(|d| d.id == id)
}

// ---------------------------------------------------------------------------
// WASM-level constants
// ---------------------------------------------------------------------------

/// Import module name under which program modules import runtime functions
/// and builtins from the builtins module.
pub const RUNTIME_IMPORT_MODULE: &str = "nova_rt";

/// Runtime function names (exports of the builtins module).
pub mod rt {
    pub const THUNK_NEW: &str = "thunk_new";
    pub const FORCE: &str = "force";
    pub const CLOSURE_NEW: &str = "closure_new";
    pub const CAPTURE_NEW: &str = "capture_new";
    pub const ENV_NEW: &str = "env_new";
    pub const LIST_NEW: &str = "list_new";
    pub const ARGS_BUF: &str = "args_buf";
    pub const CALL_CALLABLE: &str = "call_callable";
    pub const REPEAT: &str = "repeat";
    pub const SEED: &str = "seed";
    pub const RESET: &str = "reset";
    pub const FINALIZE: &str = "finalize";
    pub const RESULT_PTR: &str = "result_ptr";
    pub const RESULT_LEN: &str = "result_len";
    pub const VERSION: &str = "version";
    /// `() -> i64` — call-boundary checkpoint (plan §3.9): 0 = continue;
    /// non-zero = an ERROR handle the call site must return as its own
    /// value. Emitted by the compiler at every regular-call and value-call
    /// site; may also be called from inside builtins (chunked expensive
    /// ops). When no restriction is armed it is a pure-WASM no-op.
    pub const CHECKPOINT: &str = "__checkpoint";
    /// `(deadline_epoch_ms: f64, limit_ms: i32) -> ()` — arms the soft
    /// timeout (plan §3.9). `reset()` disarms.
    pub const SET_SOFT_TIMEOUT: &str = "set_soft_timeout";
}

/// The current ABI version (returned by `nova_rt.version`). Bumped to 2 when
/// the checkpoint channel (§3.9) added the `__checkpoint` /
/// `set_soft_timeout` exports and the `env.now` host import.
///
/// Bump discipline: the version guards the ABI *contract* (value encoding,
/// the `nova_rt.*` runtime-function surface, the checkpoint channel).
/// Purely additive changes — appending builtin ids/exports (v0.7 added ids
/// 36–60 without a bump) or error keys — do NOT bump it: old program
/// modules link unchanged against new builtins, and a new program module
/// linked against stale builtins fails loudly at link time (missing
/// import). Bump when the existing runtime surface changes.
pub const ABI_VERSION: i32 = 2;

/// Size (in i64 slots) of the scratch argument buffer for value calls.
pub const ARGS_BUF_SLOTS: usize = 64;

/// Import namespace `env` (memory + table for program modules; `call_closure`
/// and `now` for the builtins module).
pub mod env {
    pub const MEMORY: &str = "memory";
    pub const TABLE: &str = "table";
    /// Import of the builtins module: call a compiled closure through the
    /// shared funcref table. Implemented by the shim module.
    pub const CALL_CLOSURE: &str = "call_closure";
    /// Import of the builtins module: `() -> f64`, milliseconds since the
    /// Unix epoch (JS `Date.now()`). Used only by the checkpoint mechanism
    /// (plan §3.9); never called while no restriction is armed.
    pub const NOW: &str = "now";
}
