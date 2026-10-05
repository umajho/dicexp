//! `finalize` (ABI §3.5/§3.6): deep-force the root value, apply implicit
//! casts, and write the binary result encoding into the result buffer.
//!
//! The final result must be integer/boolean/nested list, else
//! `badFinalResult`. The traversal is ITERATIVE (explicit stack) so deeply
//! nested lists cannot overflow the native/WASM call stack.
//!
//! Wire format:
//! ```text
//! value  := 0x00 i64le           ; integer
//!         |  0x01 u8             ; boolean
//!         |  0x02 u32le value*   ; list
//! error  := 0x03 u32le(key) u32le(count) param*
//! param  := tag u8, then: tag=0 → i64le | tag=1 → u32le(len) utf8 | tag=2|3 → u8
//! ```

use std::cell::Cell;

use dicexp_nova_abi as abi;

use crate::errors;
use crate::mem;
use crate::runtime::{force_impl, implicit_cast_final};
use crate::values;
use values::*;

thread_local! {
    static BUF_PTR: Cell<u32> = const { Cell::new(0) };
    static BUF_LEN: Cell<u32> = const { Cell::new(0) };
    static BUF_CAP: Cell<u32> = const { Cell::new(0) };
}

/// Called by `reset()`: the buffer memory dies with the bump rewind.
pub(crate) fn reset_buffer() {
    BUF_PTR.with(|c| c.set(0));
    BUF_LEN.with(|c| c.set(0));
    BUF_CAP.with(|c| c.set(0));
}

pub(crate) fn result_ptr() -> i32 {
    BUF_PTR.with(Cell::get) as i32
}

pub(crate) fn result_len() -> i32 {
    BUF_LEN.with(Cell::get) as i32
}

struct Writer;

impl Writer {
    fn ensure(extra: usize) -> Result<(), ()> {
        let len = BUF_LEN.with(Cell::get) as usize;
        let cap = BUF_CAP.with(Cell::get) as usize;
        let need = len.checked_add(extra).ok_or(())?;
        if need <= cap {
            return Ok(());
        }
        let mut new_cap = if cap == 0 { 256 } else { cap };
        while new_cap < need {
            new_cap = new_cap.checked_mul(2).ok_or(())?;
        }
        let new_ptr = mem::halloc(new_cap).ok_or(())?;
        let old_ptr = BUF_PTR.with(Cell::get);
        // Copy old contents (old buffer is abandoned to the bump region).
        let mut i = 0;
        while i < len {
            mem::write_u8(new_ptr, i, mem::read_u8(old_ptr, i));
            i += 1;
        }
        BUF_PTR.with(|c| c.set(new_ptr));
        BUF_CAP.with(|c| c.set(new_cap as u32));
        Ok(())
    }

    fn u8(v: u8) -> Result<(), ()> {
        Self::ensure(1)?;
        let len = BUF_LEN.with(Cell::get);
        mem::write_u8(BUF_PTR.with(Cell::get), len as usize, v);
        BUF_LEN.with(|c| c.set(len + 1));
        Ok(())
    }

    fn u32le(v: u32) -> Result<(), ()> {
        Self::ensure(4)?;
        let base = BUF_PTR.with(Cell::get);
        let len = BUF_LEN.with(Cell::get) as usize;
        mem::write_u8(base, len, (v & 0xff) as u8);
        mem::write_u8(base, len + 1, ((v >> 8) & 0xff) as u8);
        mem::write_u8(base, len + 2, ((v >> 16) & 0xff) as u8);
        mem::write_u8(base, len + 3, ((v >> 24) & 0xff) as u8);
        BUF_LEN.with(|c| c.set((len + 4) as u32));
        Ok(())
    }

    fn i64le(v: i64) -> Result<(), ()> {
        Self::ensure(8)?;
        let base = BUF_PTR.with(Cell::get);
        let len = BUF_LEN.with(Cell::get) as usize;
        let u = v as u64;
        let mut i = 0;
        while i < 8 {
            mem::write_u8(base, len + i, ((u >> (i * 8)) & 0xff) as u8);
            i += 1;
        }
        BUF_LEN.with(|c| c.set((len + 8) as u32));
        Ok(())
    }

    fn bytes_from_heap(ptr: u32, off: usize, len: usize) -> Result<(), ()> {
        Self::ensure(len)?;
        let dst = BUF_PTR.with(Cell::get);
        let cur = BUF_LEN.with(Cell::get) as usize;
        let mut i = 0;
        while i < len {
            mem::write_u8(dst, cur + i, mem::read_u8(ptr, off + i));
            i += 1;
        }
        BUF_LEN.with(|c| c.set((cur + len) as u32));
        Ok(())
    }
}

/// Point the result buffer at the permanent emergency region, which holds
/// the precomputed MEMORY_LIMIT_EXCEEDED encoding (9 bytes).
fn emergency() -> i32 {
    BUF_PTR.with(|c| c.set(mem::emergency_offset()));
    BUF_LEN.with(|c| c.set(9));
    1
}

/// Encode an ERROR object as a wire `error` record. Returns Err(()) if the
/// buffer could not grow (caller falls back to the emergency encoding).
fn encode_error(err_handle: u64) -> Result<(), ()> {
    let p = value_to_heap_ptr(err_handle);
    Writer::u8(0x03)?;
    Writer::u32le(values::error_key(p))?;
    let blk = values::error_params_block(p);
    let count = values::params_count(blk);
    Writer::u32le(count)?;
    let mut i = 0;
    while i < count {
        let tag = values::param_tag(blk, i);
        let payload = values::param_payload(blk, i);
        Writer::u8(tag)?;
        match tag {
            abi::param_tag::INT => Writer::i64le(payload as i64)?,
            abi::param_tag::STRING => {
                let sp = payload as u32;
                let slen = values::string_len(sp);
                Writer::u32le(slen)?;
                Writer::bytes_from_heap(sp, 8, slen as usize)?;
            }
            // VALUE_TYPE / VALUE_TYPE_SET carry a u8 payload.
            _ => Writer::u8(payload as u8)?,
        }
        i += 1;
    }
    Ok(())
}

/// Error exit: rewind the buffer and emit ONLY the error record (the buffer
/// may already hold partial value bytes from outer lists).
fn finish_error(err_handle: u64) -> i32 {
    BUF_LEN.with(|c| c.set(0));
    if encode_error(err_handle).is_ok() {
        1
    } else {
        emergency()
    }
}

#[no_mangle]
pub extern "C" fn finalize(root: i64) -> i32 {
    reset_buffer();
    let mut stack = mem::Stack::new();
    if stack.push(root as u64).is_err() {
        return emergency();
    }
    while let Some(h) = stack.pop() {
        let v = force_impl(h);
        if is_error_handle(v) {
            return finish_error(v);
        }
        // Implicit casts (sequence$sum → sum, sequence → list), unconditionally
        // at finalize (naive's `asPlain`).
        let v = match implicit_cast_final(v) {
            Ok(v) => v,
            Err(e) => return finish_error(e),
        };
        match value_tag(v) {
            TAG_INTEGER => {
                if Writer::u8(0x00).and_then(|_| Writer::i64le(value_to_integer(v))).is_err() {
                    return emergency();
                }
            }
            TAG_BOOLEAN => {
                if Writer::u8(0x01)
                    .and_then(|_| Writer::u8(value_to_boolean(v) as u8))
                    .is_err()
                {
                    return emergency();
                }
            }
            _ => {
                let p = value_to_heap_ptr(v);
                match mem::read_u8(p, 0) {
                    abi::kind::LIST => {
                        let len = values::list_len(p);
                        if Writer::u8(0x02).and_then(|_| Writer::u32le(len)).is_err() {
                            return emergency();
                        }
                        // Push elements reversed for in-order processing.
                        let mut i = len;
                        while i > 0 {
                            i -= 1;
                            if stack.push(values::list_elem(p, i)).is_err() {
                                return emergency();
                            }
                        }
                    }
                    // Closures/captures (and anything else uncastable) cannot
                    // be a final result.
                    _ => {
                        let e = errors::bad_final_result(value_type_of(v));
                        return finish_error(e);
                    }
                }
            }
        }
    }
    0
}
