//! Runtime exports (ABI §3.5): thunks and the iterative force trampoline,
//! callable dispatch (`call_callable`), `repeat` (`#`), the per-evaluation
//! lifecycle functions, and the checkpoint channel (§3.9).

use dicexp_nova_abi as abi;

use crate::builtins;
use crate::checkpoint;
use crate::errors;
use crate::finalize;
use crate::mem;
use crate::rng;
use crate::seq;
use crate::values;
use values::*;

// ---------------------------------------------------------------------------
// env.call_closure host import (shim module on wasm; mock on native)
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn call_closure(fnidx: i32, env: i32, args: i32, argc: i32) -> i64;
}

#[cfg(target_arch = "wasm32")]
fn host_call_closure(fnidx: u32, env: u32, args: u32, argc: u32) -> u64 {
    unsafe { call_closure(fnidx as i32, env as i32, args as i32, argc as i32) as u64 }
}

/// Native stand-in for the `env.call_closure` shim import so tests can
/// exercise closure calls. Thread-local: each libtest thread gets its own.
#[cfg(not(target_arch = "wasm32"))]
pub mod call_closure_mock {
    use std::cell::Cell;

    pub type Fn = fn(i32, i32, i32, i32) -> i64;

    thread_local! {
        static MOCK: Cell<Option<Fn>> = const { Cell::new(None) };
    }

    pub fn set(f: Option<Fn>) {
        MOCK.with(|m| m.set(f));
    }

    pub(crate) fn call(fnidx: i32, env: i32, args: i32, argc: i32) -> i64 {
        let f = MOCK.with(|m| m.get());
        match f {
            Some(f) => f(fnidx, env, args, argc),
            None => panic!("call_closure mock is not set"),
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn host_call_closure(fnidx: u32, env: u32, args: u32, argc: u32) -> u64 {
    call_closure_mock::call(fnidx as i32, env as i32, args as i32, argc as i32) as u64
}

// ---------------------------------------------------------------------------
// force: iterative memoizing trampoline (collapses thunk chains — TCO, #2)
// ---------------------------------------------------------------------------

pub(crate) fn force_impl(mut v: u64) -> u64 {
    loop {
        if !is_heap(v) {
            return v;
        }
        let p = value_to_heap_ptr(v);
        if mem::read_u8(p, 0) != abi::kind::THUNK {
            return v;
        }
        let t = thunk_read(p);
        match t.state {
            abi::thunk_state::DONE => v = t.result,
            abi::thunk_state::ERROR => return t.result,
            _ => {
                let r = if t.fnidx == SENTINEL_REPEAT_FNIDX {
                    // `#` element thunk: call the repeat body closure (its
                    // offset is stored in the thunk's env field).
                    call_callable_impl(heap_ptr_to_value(t.env), 0, 0)
                } else if t.fnidx == SENTINEL_FOLDR_FNIDX {
                    // foldr/3 step thunk (v0.7): the ENV slots hold
                    // [callable, elem, acc] — evaluate `f(elem, acc)`.
                    // The result is returned unforced here: the trampoline
                    // chases it (bodies returning `$acc` unforced chain
                    // iteratively; nested forcing bodies recurse like
                    // naive's — compat.md #6).
                    let callable = values::env_slot(t.env, 0);
                    let elem = values::env_slot(t.env, 1);
                    let acc = values::env_slot(t.env, 2);
                    call_with_args(callable, &[elem, acc])
                } else {
                    host_call_closure(t.fnidx, t.env, 0, 0)
                };
                if is_error_handle(r) {
                    thunk_write_error(p, r);
                    return r;
                }
                thunk_write_done(p, r);
                v = r;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// call_callable: force callable, check arity, dispatch closure / capture
// ---------------------------------------------------------------------------

pub(crate) fn call_callable_impl(callable: u64, args_ptr: u32, argc: u32) -> u64 {
    let v = force_impl(callable);
    if is_error_handle(v) {
        return v;
    }
    if !is_heap(v) {
        return errors::value_is_not_callable();
    }
    let p = value_to_heap_ptr(v);
    match mem::read_u8(p, 0) {
        abi::kind::CLOSURE => {
            let c = closure_read(p);
            if c.arity != argc {
                return errors::wrong_arity_closure(c.arity, argc);
            }
            // Copy-on-entry: the callee's args must survive nested uses of
            // the shared args buffer (ABI §3.5 args_buf convention).
            let buf = match copy_args(args_ptr, argc) {
                Some(b) => b,
                None => return errors::memory_limit(),
            };
            host_call_closure(c.fnidx, c.env, buf, argc)
        }
        abi::kind::CAPTURE => {
            let (id, arity) = capture_read(p);
            if arity != argc {
                return errors::wrong_arity_captured(arity, argc);
            }
            builtins::dispatch_by_id(id, args_ptr)
                .unwrap_or_else(errors::value_is_not_callable)
        }
        _ => errors::value_is_not_callable(),
    }
}

fn copy_args(args_ptr: u32, argc: u32) -> Option<u32> {
    if argc == 0 {
        return Some(0);
    }
    let size = (argc as usize).checked_mul(8)?;
    let buf = mem::halloc(size)?;
    let mut i = 0;
    while i < argc {
        mem::write_u64(buf, (i as usize) * 8, mem::read_u64(args_ptr, (i as usize) * 8));
        i += 1;
    }
    Some(buf)
}

/// Call a prepared (already forced) callable with Rust-side args; used by
/// HOF builtins. The result is NOT forced (callers force as needed).
pub(crate) fn call_with_args(callable: u64, args: &[u64]) -> u64 {
    let size = match args.len().checked_mul(8) {
        Some(s) => s,
        None => return errors::memory_limit(),
    };
    let buf = match mem::halloc(size.max(8)) {
        Some(b) => b,
        None => return errors::memory_limit(),
    };
    for (i, &a) in args.iter().enumerate() {
        mem::write_u64(buf, i * 8, a);
    }
    call_callable_impl(callable, buf, args.len() as u32)
}

// ---------------------------------------------------------------------------
// argument unwrapping (naive's unwrapValue: force, implicit casts, type check)
// ---------------------------------------------------------------------------

/// Force `h` per an eager parameter spec, applying implicit sequence casts,
/// then check the resulting type against `mask`. `pos` is the 1-based
/// parameter position for `callArgumentTypeMismatch`.
pub(crate) fn unwrap_arg(h: u64, mask: u8, pos: u32) -> Result<u64, u64> {
    let v = force_impl(h);
    if is_error_handle(v) {
        return Err(v);
    }
    let v = implicit_cast(v, mask)?;
    let t = value_type_of(v);
    if mask & (1 << t) == 0 {
        return Err(errors::call_argument_type_mismatch(pos, mask, t));
    }
    Ok(v)
}

/// naive's `tryAdaptType` cast step: a sequence whose type is not in the spec
/// is implicitly cast (`sequence$sum` → sum integer, `sequence` → list).
pub(crate) fn implicit_cast(v: u64, mask: u8) -> Result<u64, u64> {
    if !seq::is_sequence(v) {
        return Ok(v);
    }
    let p = value_to_heap_ptr(v);
    if values::seq_is_sum_ptr(p) {
        if mask & (1 << abi::value_type::SEQUENCE_SUM) == 0 {
            let sum = seq::cast_to_sum(p)?;
            return Ok(integer_to_value(sum));
        }
    } else if mask & (1 << abi::value_type::SEQUENCE) == 0 {
        return seq::cast_to_list(p);
    }
    Ok(v)
}

/// Unconditional implicit cast used by `finalize` (naive's `asPlain`).
pub(crate) fn implicit_cast_final(v: u64) -> Result<u64, u64> {
    implicit_cast(v, 0)
}

pub(crate) fn unwrap_int(h: u64, pos: u32) -> Result<i64, u64> {
    unwrap_arg(h, errors::mask::INTEGER, pos).map(value_to_integer)
}

pub(crate) fn unwrap_bool(h: u64, pos: u32) -> Result<bool, u64> {
    unwrap_arg(h, errors::mask::BOOLEAN, pos).map(value_to_boolean)
}

/// Force + cast to a LIST; returns the list object offset.
pub(crate) fn unwrap_list(h: u64, pos: u32) -> Result<u32, u64> {
    unwrap_arg(h, errors::mask::LIST, pos).map(value_to_heap_ptr)
}

pub(crate) fn unwrap_callable(h: u64, pos: u32) -> Result<u64, u64> {
    unwrap_arg(h, errors::mask::CALLABLE, pos)
}

// ---------------------------------------------------------------------------
// ABI exports (module `nova_rt` on the program side)
// ---------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn thunk_new(fnidx: i32, env: i32) -> i64 {
    values::thunk_new(fnidx as u32, env as u32) as i64
}

#[no_mangle]
pub extern "C" fn force(v: i64) -> i64 {
    force_impl(v as u64) as i64
}

#[no_mangle]
pub extern "C" fn closure_new(fnidx: i32, env: i32, arity: i32) -> i64 {
    values::closure_new(fnidx as u32, env as u32, arity as u32) as i64
}

#[no_mangle]
pub extern "C" fn capture_new(builtin_id: i32, arity: i32) -> i64 {
    values::capture_new(builtin_id as u32, arity as u32) as i64
}

#[no_mangle]
pub extern "C" fn env_new(parent: i32, count: i32) -> i32 {
    values::env_new(parent as u32, count.max(0) as u32) as i32
}

#[no_mangle]
pub extern "C" fn list_new(capacity: i32) -> i32 {
    values::list_new(capacity.max(0) as u32) as i32
}

#[no_mangle]
pub extern "C" fn args_buf() -> i32 {
    mem::args_buf_offset() as i32
}

#[no_mangle]
pub extern "C" fn call_callable(callable: i64, args_ptr: i32, argc: i32) -> i64 {
    call_callable_impl(callable as u64, args_ptr as u32, argc.max(0) as u32) as i64
}

/// `#`: forces the count eagerly, then returns a repeat SEQUENCE whose
/// positions re-evaluate the body closure lazily (naive parity).
#[no_mangle]
pub extern "C" fn repeat(count: i64, closure: i64) -> i64 {
    let cv = force_impl(count as u64);
    if is_error_handle(cv) {
        return cv as i64;
    }
    // naive uses `asInteger` (which casts sequences implicitly) for the count.
    let cv = match implicit_cast(cv, errors::mask::INTEGER) {
        Ok(v) => v,
        Err(e) => return e as i64,
    };
    if value_tag(cv) != TAG_INTEGER {
        return errors::repeat_count_type_mismatch(value_type_of(cv)) as i64;
    }
    let n = value_to_integer(cv);

    let f = force_impl(closure as u64);
    if is_error_handle(f) {
        return f as i64;
    }
    let callable = matches!(
        heap_kind(f),
        Some(abi::kind::CLOSURE) | Some(abi::kind::CAPTURE)
    );
    if !callable {
        return errors::value_is_not_callable() as i64;
    }

    if n <= 0 {
        // naive: count == 0 → empty list. count < 0 crashes naive
        // (`new Array(-1)` RangeError); nova returns the empty list instead
        // ([DEVIATION], see report).
        return match values::list_new_fallible(0) {
            Some(p) => heap_ptr_to_value(p) as i64,
            None => errors::memory_limit() as i64,
        };
    }
    seq::new_repeat(value_to_heap_ptr(f), n as u64) as i64
}

#[no_mangle]
pub extern "C" fn seed(seed: i32) {
    rng::seed(seed);
}

/// Call-boundary checkpoint (plan §3.9): 0 = continue; non-zero = an ERROR
/// handle the call site returns as its own value. Emitted by the compiler at
/// every regular-call and value-call site. A pure no-op while no restriction
/// is armed (`env.now` is never called).
#[no_mangle]
pub extern "C" fn __checkpoint() -> i64 {
    checkpoint::checkpoint_impl() as i64
}

/// Arm the soft timeout (plan §3.9); JS computes `Date.now() + ms` at
/// evaluation start. `reset()` disarms.
#[no_mangle]
pub extern "C" fn set_soft_timeout(deadline_epoch_ms: f64, limit_ms: i32) {
    checkpoint::arm(deadline_epoch_ms, limit_ms as i64);
}

#[no_mangle]
pub extern "C" fn reset() {
    mem::rewind();
    finalize::reset_buffer();
    checkpoint::disarm();
}

#[no_mangle]
pub extern "C" fn result_ptr() -> i32 {
    finalize::result_ptr()
}

#[no_mangle]
pub extern "C" fn result_len() -> i32 {
    finalize::result_len()
}

#[no_mangle]
pub extern "C" fn version() -> i32 {
    abi::ABI_VERSION
}
