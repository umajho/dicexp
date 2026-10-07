//! Heap object layouts, constructors and accessors (ABI §3.1).
//!
//! All objects are 8-byte aligned with header
//! `{ kind: u8, flags: u8, _reserved: u16, len: u32 }` followed by the payload.
//! Every constructor is total: on allocation failure it returns the
//! preallocated OOM error handle (a valid ERROR object), so structured
//! `memoryLimitExceeded` errors propagate instead of trapping.

use dicexp_nova_abi as abi;

use crate::mem;

pub(crate) const HDR_KIND_ERROR: u8 = abi::kind::ERROR;

/// `fnidx` sentinel marking a thunk that evaluates one element of a `repeat`
/// (`#`) sequence: its `env` field holds the byte offset of the closure
/// object to call with no arguments. Real `fnidx` values are small table
/// indices and can never collide with `u32::MAX`.
pub(crate) const SENTINEL_REPEAT_FNIDX: u32 = u32::MAX;

/// `fnidx` sentinel marking one deferred `foldr/3` step: its `env` field
/// holds an ENV object whose slots are `[callable, elem_handle, acc_handle]`,
/// evaluated as `f(elem, acc)` by the force trampoline (see
/// `bf_foldr_3_impl` in builtins.rs). Real `fnidx` values are small table
/// indices and can never collide with `u32::MAX - 1`.
pub(crate) const SENTINEL_FOLDR_FNIDX: u32 = u32::MAX - 1;

// ---------------------------------------------------------------------------
// value handle helpers (re-exported ABI tagging)
// ---------------------------------------------------------------------------

pub(crate) use abi::{
    boolean_to_value, heap_ptr_to_value, integer_to_value, value_tag, value_to_boolean,
    value_to_heap_ptr, value_to_integer, TAG_BOOLEAN, TAG_HEAP, TAG_INTEGER,
};

#[inline]
pub(crate) fn is_heap(v: u64) -> bool {
    value_tag(v) == TAG_HEAP
}

#[inline]
pub(crate) fn heap_kind(v: u64) -> Option<u8> {
    if is_heap(v) {
        Some(mem::read_u8(value_to_heap_ptr(v), 0))
    } else {
        None
    }
}

#[inline]
pub(crate) fn is_error_handle(v: u64) -> bool {
    heap_kind(v) == Some(abi::kind::ERROR)
}

/// ABI value-type enum (for error params) of a *forced, non-error* value.
/// Thunks must have been collapsed by `force` already.
pub(crate) fn value_type_of(v: u64) -> u8 {
    match value_tag(v) {
        TAG_INTEGER => abi::value_type::INTEGER,
        TAG_BOOLEAN => abi::value_type::BOOLEAN,
        _ => match mem::read_u8(value_to_heap_ptr(v), 0) {
            abi::kind::LIST => abi::value_type::LIST,
            abi::kind::CLOSURE | abi::kind::CAPTURE => abi::value_type::CALLABLE,
            abi::kind::SEQUENCE => {
                if seq_is_sum_ptr(value_to_heap_ptr(v)) {
                    abi::value_type::SEQUENCE_SUM
                } else {
                    abi::value_type::SEQUENCE
                }
            }
            // ERROR/THUNK/ENV/STRING never surface as user values here; the
            // caller guarantees a forced non-error value. Fall back to the
            // callable bucket defensively (unreachable by construction).
            _ => abi::value_type::CALLABLE,
        },
    }
}

// ---------------------------------------------------------------------------
// THUNK (1): payload { state: u8, fnidx: u32, env: ptr, result: u64 }
// ---------------------------------------------------------------------------

const THUNK_STATE: usize = 8;
const THUNK_FNIDX: usize = 12;
const THUNK_ENV: usize = 16;
const THUNK_RESULT: usize = 24;
const THUNK_SIZE: usize = 32;

pub(crate) fn thunk_new(fnidx: u32, env: u32) -> u64 {
    match mem::halloc(THUNK_SIZE) {
        Some(p) => {
            mem::write_u8(p, 0, abi::kind::THUNK);
            mem::write_u8(p, THUNK_STATE, abi::thunk_state::UNEVALUATED);
            mem::write_u32(p, THUNK_FNIDX, fnidx);
            mem::write_u32(p, THUNK_ENV, env);
            mem::write_u64(p, THUNK_RESULT, 0);
            heap_ptr_to_value(p)
        }
        None => oom_handle(),
    }
}

pub(crate) struct Thunk {
    pub state: u8,
    pub fnidx: u32,
    pub env: u32,
    pub result: u64,
}

pub(crate) fn thunk_read(p: u32) -> Thunk {
    Thunk {
        state: mem::read_u8(p, THUNK_STATE),
        fnidx: mem::read_u32(p, THUNK_FNIDX),
        env: mem::read_u32(p, THUNK_ENV),
        result: mem::read_u64(p, THUNK_RESULT),
    }
}

pub(crate) fn thunk_write_done(p: u32, result: u64) {
    mem::write_u64(p, THUNK_RESULT, result);
    mem::write_u8(p, THUNK_STATE, abi::thunk_state::DONE);
}

pub(crate) fn thunk_write_error(p: u32, err: u64) {
    mem::write_u64(p, THUNK_RESULT, err);
    mem::write_u8(p, THUNK_STATE, abi::thunk_state::ERROR);
}

// ---------------------------------------------------------------------------
// CLOSURE (2): payload { fnidx: u32, env: ptr, arity: u32 }
// ---------------------------------------------------------------------------

const CLOSURE_FNIDX: usize = 8;
const CLOSURE_ENV: usize = 12;
const CLOSURE_ARITY: usize = 16;
const CLOSURE_SIZE: usize = 24;

pub(crate) fn closure_new(fnidx: u32, env: u32, arity: u32) -> u64 {
    match mem::halloc(CLOSURE_SIZE) {
        Some(p) => {
            mem::write_u8(p, 0, abi::kind::CLOSURE);
            mem::write_u32(p, CLOSURE_FNIDX, fnidx);
            mem::write_u32(p, CLOSURE_ENV, env);
            mem::write_u32(p, CLOSURE_ARITY, arity);
            heap_ptr_to_value(p)
        }
        None => oom_handle(),
    }
}

pub(crate) struct Closure {
    pub fnidx: u32,
    pub env: u32,
    pub arity: u32,
}

pub(crate) fn closure_read(p: u32) -> Closure {
    Closure {
        fnidx: mem::read_u32(p, CLOSURE_FNIDX),
        env: mem::read_u32(p, CLOSURE_ENV),
        arity: mem::read_u32(p, CLOSURE_ARITY),
    }
}

// ---------------------------------------------------------------------------
// CAPTURE (3): payload { builtin_id: u32, arity: u32 }
// ---------------------------------------------------------------------------

const CAPTURE_ID: usize = 8;
const CAPTURE_ARITY: usize = 12;
const CAPTURE_SIZE: usize = 16;

pub(crate) fn capture_new(builtin_id: u32, arity: u32) -> u64 {
    match mem::halloc(CAPTURE_SIZE) {
        Some(p) => {
            mem::write_u8(p, 0, abi::kind::CAPTURE);
            mem::write_u32(p, CAPTURE_ID, builtin_id);
            mem::write_u32(p, CAPTURE_ARITY, arity);
            heap_ptr_to_value(p)
        }
        None => oom_handle(),
    }
}

pub(crate) fn capture_read(p: u32) -> (u32, u32) {
    (
        mem::read_u32(p, CAPTURE_ID),
        mem::read_u32(p, CAPTURE_ARITY),
    )
}

// ---------------------------------------------------------------------------
// ENV (4): payload { parent: ptr (0 = none), slots: [u64; len] }
// ---------------------------------------------------------------------------

const ENV_PARENT: usize = 8;
const ENV_SLOTS: usize = 16;

/// Checked object size (count fields are u32; on wasm32 `usize` is 32 bits,
/// so naive multiplication could wrap — always checked).
fn elems_size(header: usize, count: u32) -> Option<usize> {
    (count as usize)
        .checked_mul(8)
        .and_then(|n| n.checked_add(header))
}

pub(crate) fn env_new(parent: u32, count: u32) -> u32 {
    let size = match elems_size(ENV_SLOTS, count) {
        Some(s) => s,
        None => return mem::sink_offset(),
    };
    match mem::halloc(size) {
        Some(p) => {
            mem::write_u8(p, 0, abi::kind::ENV);
            mem::write_u32(p, 4, count); // header len = slot count
            mem::write_u32(p, ENV_PARENT, parent);
            p
        }
        // No error channel in the ABI (returns a bare ptr); hand out the
        // scratch sink so the caller's slot writes land harmlessly. An OOM
        // error handle will surface through a later allocation.
        None => mem::sink_offset(),
    }
}

#[inline]
pub(crate) fn env_slot(p: u32, i: u32) -> u64 {
    mem::read_u64(p, ENV_SLOTS + (i as usize) * 8)
}

#[inline]
pub(crate) fn env_set_slot(p: u32, i: u32, v: u64) {
    mem::write_u64(p, ENV_SLOTS + (i as usize) * 8, v);
}

// ---------------------------------------------------------------------------
// LIST (5): payload { elems: [u64; len] }
// ---------------------------------------------------------------------------

const LIST_ELEMS: usize = 8;

pub(crate) fn list_new(count: u32) -> u32 {
    let size = match elems_size(LIST_ELEMS, count) {
        Some(s) => s,
        None => return mem::sink_offset(),
    };
    match mem::halloc(size) {
        Some(p) => {
            mem::write_u8(p, 0, abi::kind::LIST);
            mem::write_u32(p, 4, count); // header len = element count
            p
        }
        None => mem::sink_offset(), // see env_new
    }
}

/// `list_new`, but reporting failure (for callers that can propagate errors).
pub(crate) fn list_new_fallible(count: u32) -> Option<u32> {
    let size = elems_size(LIST_ELEMS, count)?;
    mem::halloc(size).map(|p| {
        mem::write_u8(p, 0, abi::kind::LIST);
        mem::write_u32(p, 4, count);
        p
    })
}

#[inline]
pub(crate) fn list_len(p: u32) -> u32 {
    mem::read_u32(p, 4)
}

#[inline]
pub(crate) fn list_elem(p: u32, i: u32) -> u64 {
    mem::read_u64(p, LIST_ELEMS + (i as usize) * 8)
}

#[inline]
pub(crate) fn list_set(p: u32, i: u32, v: u64) {
    mem::write_u64(p, LIST_ELEMS + (i as usize) * 8, v);
}

// ---------------------------------------------------------------------------
// ERROR (6): payload { key: u32, params: ptr }
// params -> { count: u32, _pad: u32, items: [Param; count] },
// Param = { tag: u8, _pad: [u8; 7], payload: u64 } (16 bytes).
// ---------------------------------------------------------------------------

const ERROR_KEY: usize = 8;
const ERROR_PARAMS: usize = 12;
const ERROR_SIZE: usize = 16;

const PARAMS_COUNT: usize = 0;
const PARAMS_ITEMS: usize = 8;
const PARAM_SIZE: usize = 16;
const PARAM_TAG: usize = 0;
const PARAM_PAYLOAD: usize = 8;

/// Build an ERROR object. `params` are `(param_tag::*, payload)` pairs;
/// for `param_tag::STRING` the payload must be a STRING object offset.
/// Total: returns the OOM handle on allocation failure.
pub(crate) fn error_new(key: u32, params: &[(u8, u64)]) -> u64 {
    let params_size = PARAMS_ITEMS + params.len() * PARAM_SIZE;
    let (obj, blk) = match mem::halloc(ERROR_SIZE).and_then(|o| {
        mem::halloc(params_size).map(|b| (o, b))
    }) {
        Some(pair) => pair,
        None => return oom_handle(),
    };
    mem::write_u8(obj, 0, abi::kind::ERROR);
    mem::write_u32(obj, ERROR_KEY, key);
    mem::write_u32(obj, ERROR_PARAMS, blk);
    mem::write_u32(blk, PARAMS_COUNT, params.len() as u32);
    for (i, &(tag, payload)) in params.iter().enumerate() {
        let item = PARAMS_ITEMS + i * PARAM_SIZE;
        mem::write_u8(blk, item + PARAM_TAG, tag);
        mem::write_u64(blk, item + PARAM_PAYLOAD, payload);
    }
    heap_ptr_to_value(obj)
}

#[inline]
pub(crate) fn error_key(p: u32) -> u32 {
    mem::read_u32(p, ERROR_KEY)
}

#[inline]
pub(crate) fn error_params_block(p: u32) -> u32 {
    mem::read_u32(p, ERROR_PARAMS)
}

#[inline]
pub(crate) fn params_count(blk: u32) -> u32 {
    mem::read_u32(blk, PARAMS_COUNT)
}

#[inline]
pub(crate) fn param_tag(blk: u32, i: u32) -> u8 {
    mem::read_u8(blk, PARAMS_ITEMS + (i as usize) * PARAM_SIZE + PARAM_TAG)
}

#[inline]
pub(crate) fn param_payload(blk: u32, i: u32) -> u64 {
    mem::read_u64(blk, PARAMS_ITEMS + (i as usize) * PARAM_SIZE + PARAM_PAYLOAD)
}

/// The preallocated MEMORY_LIMIT_EXCEEDED error handle (never fails).
pub(crate) fn oom_handle() -> u64 {
    heap_ptr_to_value(mem::oom_error_offset())
}

// ---------------------------------------------------------------------------
// STRING (7): payload { utf8: [u8; len] }
// ---------------------------------------------------------------------------

const STRING_BYTES: usize = 8;

pub(crate) fn string_new(bytes: &[u8]) -> Option<u32> {
    mem::halloc(STRING_BYTES + bytes.len()).map(|p| {
        mem::write_u8(p, 0, abi::kind::STRING);
        mem::write_u32(p, 4, bytes.len() as u32);
        mem::write_bytes(p, STRING_BYTES, bytes);
        p
    })
}

#[inline]
pub(crate) fn string_len(p: u32) -> u32 {
    mem::read_u32(p, 4)
}

// ---------------------------------------------------------------------------
// SEQUENCE (8): stream object (layout is builtins-internal; ABI only fixes
// the kind byte and `flags & 1` = sequence$sum). Sources have
// kind-specific layouts after the shared prefix.
//
// shared payload prefix:
//   @8  source_tag: u32   (0 = dice-sum, 1 = repeat, 2 = transformer,
//                         3 = iterate, 4 = unfold, 5 = drop)
//   @16 a: u64            (dice: lower; repeat: closure object offset;
//                         transformer/drop: source SEQUENCE value handle;
//                         iterate: start handle; unfold: current seed
//                         handle — replaced after every step)
//   @24 b: u64            (dice: upper; repeat: unused; transformer/
//                         iterate/unfold: closure value handle; drop:
//                         skip count)
//   @32 nominal: u64      (nominal length; transformer/iterate/unfold/drop:
//                         unused/0 — the end is decided per output / never /
//                         by the source)
//   @40 memo_ptr: u32     (buffer of u64 slots: drawn ints / element handles)
//   @44 memo_len: u32
//   @48 memo_cap: u32
//
// transformer-family tail (source_tag ∈ {2, 3, 4, 5}; object size 80, see
// `sequence_new_transformer` / `sequence_new_lazy`):
//   @52 t_flags: u8       (bit 0 = is_explode [2], bit 1 = track [2],
//                         bit 2 = ended [2/3/4/5])
//   @56 t_cursor: u64     (2/5: next source position to pull; 3/4: unused)
//   @64 t_remain: i64     (signed outstanding-output debt, source 2 only —
//                         may go negative in chained-transformer cases,
//                         never clamped)
//   @72 t_last_ptr: u32   (parallel is_last bytes, one per memo position;
//                         t_last_len is always memo_len)
//   @76 t_last_cap: u32
// ---------------------------------------------------------------------------

const SEQ_SOURCE: usize = 8;
const SEQ_A: usize = 16;
const SEQ_B: usize = 24;
const SEQ_NOMINAL: usize = 32;
const SEQ_MEMO_PTR: usize = 40;
const SEQ_MEMO_LEN: usize = 44;
const SEQ_MEMO_CAP: usize = 48;
const SEQ_SIZE: usize = 56;

const SEQ_T_FLAGS: usize = 52;
const SEQ_T_CURSOR: usize = 56;
const SEQ_T_REMAIN: usize = 64;
const SEQ_T_LAST_PTR: usize = 72;
const SEQ_T_LAST_CAP: usize = 76;
const SEQ_T_SIZE: usize = 80;

pub(crate) const SEQ_SOURCE_DICE_SUM: u32 = 0;
pub(crate) const SEQ_SOURCE_REPEAT: u32 = 1;
pub(crate) const SEQ_SOURCE_TRANSFORMER: u32 = 2;
pub(crate) const SEQ_SOURCE_ITERATE: u32 = 3;
pub(crate) const SEQ_SOURCE_UNFOLD: u32 = 4;
pub(crate) const SEQ_SOURCE_DROP: u32 = 5;

/// Transformer `t_flags` bits.
pub(crate) const SEQ_T_EXPLODE: u8 = 1 << 0;
/// naive's `shouldTrackBaseRolls`: still accruing one base output per
/// source pull (until the source's nominal-last position is pulled).
pub(crate) const SEQ_T_TRACK: u8 = 1 << 1;
/// Production has ended (terminal error, or the source ended): positions
/// at/after the current memo length do not exist.
pub(crate) const SEQ_T_ENDED: u8 = 1 << 2;

pub(crate) fn sequence_new(
    is_sum: bool,
    source: u32,
    a: u64,
    b: u64,
    nominal: u64,
) -> u64 {
    match mem::halloc(SEQ_SIZE) {
        Some(p) => {
            mem::write_u8(p, 0, abi::kind::SEQUENCE);
            mem::write_u8(p, 1, if is_sum { abi::SEQUENCE_FLAG_SUM } else { 0 });
            mem::write_u32(p, SEQ_SOURCE, source);
            mem::write_u64(p, SEQ_A, a);
            mem::write_u64(p, SEQ_B, b);
            mem::write_u64(p, SEQ_NOMINAL, nominal);
            mem::write_u32(p, SEQ_MEMO_PTR, 0);
            mem::write_u32(p, SEQ_MEMO_LEN, 0);
            mem::write_u32(p, SEQ_MEMO_CAP, 0);
            heap_ptr_to_value(p)
        }
        None => oom_handle(),
    }
}

/// Create a reroll/explode transformer stream wrapping `source` (a
/// SEQUENCE value handle) with `closure` (a callable value handle). The
/// `sequence$sum` flag mirrors the source's. Nothing is pulled here —
/// outputs (and RNG draws) happen lazily per pull in `seq`.
pub(crate) fn sequence_new_transformer(
    is_sum: bool,
    source: u64,
    closure: u64,
    is_explode: bool,
) -> u64 {
    match mem::halloc(SEQ_T_SIZE) {
        Some(p) => {
            mem::write_u8(p, 0, abi::kind::SEQUENCE);
            mem::write_u8(p, 1, if is_sum { abi::SEQUENCE_FLAG_SUM } else { 0 });
            mem::write_u32(p, SEQ_SOURCE, SEQ_SOURCE_TRANSFORMER);
            mem::write_u64(p, SEQ_A, source);
            mem::write_u64(p, SEQ_B, closure);
            mem::write_u64(p, SEQ_NOMINAL, 0);
            mem::write_u32(p, SEQ_MEMO_PTR, 0);
            mem::write_u32(p, SEQ_MEMO_LEN, 0);
            mem::write_u32(p, SEQ_MEMO_CAP, 0);
            mem::write_u8(
                p,
                SEQ_T_FLAGS,
                if is_explode { SEQ_T_EXPLODE } else { 0 } | SEQ_T_TRACK,
            );
            mem::write_u64(p, SEQ_T_CURSOR, 0);
            mem::write_u64(p, SEQ_T_REMAIN, 0);
            mem::write_u32(p, SEQ_T_LAST_PTR, 0);
            mem::write_u32(p, SEQ_T_LAST_CAP, 0);
            heap_ptr_to_value(p)
        }
        None => oom_handle(),
    }
}

/// Create an iterate/unfold/drop stream: the transformer-family layout
/// (shared value memo + parallel is_last region, `ended` flag bit) with the
/// per-source `a`/`b` fields; `drop` stores its skip count in the cursor
/// field. Always a PLAIN sequence (`is_sum` = false — drop drops the
/// source's $sum-ness); construction pulls nothing.
pub(crate) fn sequence_new_lazy(source: u32, a: u64, b: u64, cursor: u64) -> u64 {
    match mem::halloc(SEQ_T_SIZE) {
        Some(p) => {
            mem::write_u8(p, 0, abi::kind::SEQUENCE);
            mem::write_u8(p, 1, 0);
            mem::write_u32(p, SEQ_SOURCE, source);
            mem::write_u64(p, SEQ_A, a);
            mem::write_u64(p, SEQ_B, b);
            mem::write_u64(p, SEQ_NOMINAL, 0);
            mem::write_u32(p, SEQ_MEMO_PTR, 0);
            mem::write_u32(p, SEQ_MEMO_LEN, 0);
            mem::write_u32(p, SEQ_MEMO_CAP, 0);
            mem::write_u8(p, SEQ_T_FLAGS, 0);
            mem::write_u64(p, SEQ_T_CURSOR, cursor);
            mem::write_u64(p, SEQ_T_REMAIN, 0);
            mem::write_u32(p, SEQ_T_LAST_PTR, 0);
            mem::write_u32(p, SEQ_T_LAST_CAP, 0);
            heap_ptr_to_value(p)
        }
        None => oom_handle(),
    }
}

#[inline]
pub(crate) fn seq_is_sum_ptr(p: u32) -> bool {
    mem::read_u8(p, 1) & abi::SEQUENCE_FLAG_SUM != 0
}

#[inline]
pub(crate) fn seq_source(p: u32) -> u32 {
    mem::read_u32(p, SEQ_SOURCE)
}
#[inline]
pub(crate) fn seq_a(p: u32) -> u64 {
    mem::read_u64(p, SEQ_A)
}
/// Replace the `a` field (the unfold source's current-seed handle after a
/// successful step).
#[inline]
pub(crate) fn seq_set_a(p: u32, v: u64) {
    mem::write_u64(p, SEQ_A, v);
}
#[inline]
pub(crate) fn seq_b(p: u32) -> u64 {
    mem::read_u64(p, SEQ_B)
}
#[inline]
pub(crate) fn seq_nominal(p: u32) -> u64 {
    mem::read_u64(p, SEQ_NOMINAL)
}
#[inline]
pub(crate) fn seq_memo_ptr(p: u32) -> u32 {
    mem::read_u32(p, SEQ_MEMO_PTR)
}
#[inline]
pub(crate) fn seq_memo_len(p: u32) -> u32 {
    mem::read_u32(p, SEQ_MEMO_LEN)
}
#[inline]
pub(crate) fn seq_memo_cap(p: u32) -> u32 {
    mem::read_u32(p, SEQ_MEMO_CAP)
}

/// Append one slot to the memo buffer, growing (realloc-copy) as needed.
/// Returns `false` on allocation failure.
pub(crate) fn seq_memo_push(p: u32, slot: u64) -> bool {
    let len = seq_memo_len(p);
    let cap = seq_memo_cap(p);
    if len == cap {
        let new_cap = if cap == 0 { 8 } else { cap.saturating_mul(2) };
        let size = match (new_cap as usize).checked_mul(8) {
            Some(s) => s,
            None => return false,
        };
        let new_ptr = match mem::halloc(size) {
            Some(np) => np,
            None => return false,
        };
        // Copy old slots (old buffer is simply abandoned to the bump region).
        let old_ptr = seq_memo_ptr(p);
        let mut i = 0;
        while i < len {
            mem::write_u64(new_ptr, (i as usize) * 8, mem::read_u64(old_ptr, (i as usize) * 8));
            i += 1;
        }
        mem::write_u32(p, SEQ_MEMO_PTR, new_ptr);
        mem::write_u32(p, SEQ_MEMO_CAP, new_cap);
    }
    let len = seq_memo_len(p);
    mem::write_u64(seq_memo_ptr(p), (len as usize) * 8, slot);
    mem::write_u32(p, SEQ_MEMO_LEN, len + 1);
    true
}

#[inline]
pub(crate) fn seq_memo_get(p: u32, i: u32) -> u64 {
    mem::read_u64(seq_memo_ptr(p), (i as usize) * 8)
}

// --- transformer-source accessors (see the SEQUENCE layout above) ---------

#[inline]
pub(crate) fn seq_t_flag(p: u32, bit: u8) -> bool {
    mem::read_u8(p, SEQ_T_FLAGS) & bit != 0
}

#[inline]
pub(crate) fn seq_t_set_flag(p: u32, bit: u8, v: bool) {
    let mut f = mem::read_u8(p, SEQ_T_FLAGS);
    if v {
        f |= bit;
    } else {
        f &= !bit;
    }
    mem::write_u8(p, SEQ_T_FLAGS, f);
}

#[inline]
pub(crate) fn seq_t_cursor(p: u32) -> u64 {
    mem::read_u64(p, SEQ_T_CURSOR)
}

#[inline]
pub(crate) fn seq_t_set_cursor(p: u32, v: u64) {
    mem::write_u64(p, SEQ_T_CURSOR, v);
}

#[inline]
pub(crate) fn seq_t_remain(p: u32) -> i64 {
    mem::read_u64(p, SEQ_T_REMAIN) as i64
}

/// Add to the signed debt counter. `wrapping_add` only for totality: the
/// memory limit fires long before an i64 could actually wrap (every +1
/// requires at least one memo slot of allocation).
#[inline]
pub(crate) fn seq_t_add_remain(p: u32, d: i64) {
    let v = seq_t_remain(p).wrapping_add(d);
    mem::write_u64(p, SEQ_T_REMAIN, v as u64);
}

/// The memoized is_last bit of transformer output `i` (i < memo_len).
#[inline]
pub(crate) fn seq_t_is_last_at(p: u32, i: u32) -> bool {
    mem::read_u8(mem::read_u32(p, SEQ_T_LAST_PTR), i as usize) != 0
}

/// Append one transformer output (handle + is_last bit), growing the value
/// memo and the parallel is_last byte buffer in lockstep (the is_last buffer
/// grows first so a mid-grow failure leaves both buffers consistent).
/// Returns `false` on allocation failure.
pub(crate) fn seq_t_memo_push(p: u32, handle: u64, is_last: bool) -> bool {
    let len = seq_memo_len(p);
    let cap = mem::read_u32(p, SEQ_T_LAST_CAP);
    if len >= cap {
        let new_cap = if cap == 0 { 8 } else { cap.saturating_mul(2) };
        let new_ptr = match mem::halloc(new_cap as usize) {
            Some(np) => np,
            None => return false,
        };
        let old_ptr = mem::read_u32(p, SEQ_T_LAST_PTR);
        let mut i = 0;
        while i < len {
            mem::write_u8(new_ptr, i as usize, mem::read_u8(old_ptr, i as usize));
            i += 1;
        }
        mem::write_u32(p, SEQ_T_LAST_PTR, new_ptr);
        mem::write_u32(p, SEQ_T_LAST_CAP, new_cap);
    }
    if !seq_memo_push(p, handle) {
        return false;
    }
    mem::write_u8(mem::read_u32(p, SEQ_T_LAST_PTR), len as usize, is_last as u8);
    true
}
