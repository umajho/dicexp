//! The cdylib JS-facing API (consumed by `@dicexp/nova`'s `machine.ts`).
//!
//! ```text
//! __reset()                         clear all buffers (call before __alloc)
//! __alloc(len: i32) -> i32          resize the input buffer; returns its ptr
//! compile(ptr: i32, len: i32) -> i32   0 = ok, 1 = compile errors
//!   on success: __out_ptr/__out_len -> the emitted wasm bytes,
//!               __meta_table_size   -> funcref table slots used (0..N)
//!   on failure: __err_ptr/__err_len -> the error buffer (see error.rs)
//! ```
//!
//! State is kept in `thread_local` storage (wasm32 is single-threaded); the
//! default std allocator is used and `__reset` clears everything, so no
//! memory leaks across compiles. No panics on wasm paths: the whole pipeline
//! is `Result`-based.

use std::cell::RefCell;

use crate::error::encode_error_buffer;

#[derive(Default)]
struct ApiState {
    /// Input buffer the JS side writes the (UTF-8) source into.
    input: Vec<u8>,
    /// Emitted wasm bytes (on success).
    output: Vec<u8>,
    /// Encoded error buffer (on failure).
    errors: Vec<u8>,
    /// Funcref table slots used by the emitted program (on success).
    table_size: u32,
}

thread_local! {
    static STATE: RefCell<ApiState> = RefCell::new(ApiState::default());
}

#[no_mangle]
pub extern "C" fn __reset() {
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        s.input.clear();
        s.output.clear();
        s.errors.clear();
        s.table_size = 0;
    });
}

#[no_mangle]
pub extern "C" fn __alloc(len: i32) -> i32 {
    if len <= 0 {
        return 0;
    }
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        s.input.clear();
        s.input.reserve(len as usize);
        s.input.as_mut_ptr() as i32
    })
}

#[no_mangle]
pub extern "C" fn compile(src_ptr: i32, src_len: i32) -> i32 {
    if src_ptr == 0 || src_len <= 0 {
        // Empty source: still a valid compile attempt (will be a parse error).
        return finish(src_len.max(0) as usize, "");
    }
    // SAFETY (wasm): `src_ptr`/`src_len` refer to our own linear memory (the
    // JS side passes what `__alloc` returned). On native this is only called
    // with valid slices in tests.
    let bytes = unsafe { std::slice::from_raw_parts(src_ptr as *const u8, src_len as usize) };
    let src = String::from_utf8_lossy(bytes);
    finish(src_len as usize, &src)
}

fn finish(_src_len: usize, src: &str) -> i32 {
    STATE.with(|s| {
        let mut s = s.borrow_mut();
        match crate::compile_source(src) {
            Ok(ok) => {
                s.output = ok.wasm_bytes;
                s.table_size = ok.table_size;
                0
            }
            Err(errors) => {
                s.errors = encode_error_buffer(&errors);
                1
            }
        }
    })
}

#[no_mangle]
pub extern "C" fn __out_ptr() -> i32 {
    STATE.with(|s| s.borrow().output.as_ptr() as i32)
}

#[no_mangle]
pub extern "C" fn __out_len() -> i32 {
    STATE.with(|s| s.borrow().output.len() as i32)
}

#[no_mangle]
pub extern "C" fn __meta_table_size() -> i32 {
    STATE.with(|s| s.borrow().table_size as i32)
}

#[no_mangle]
pub extern "C" fn __err_ptr() -> i32 {
    STATE.with(|s| s.borrow().errors.as_ptr() as i32)
}

#[no_mangle]
pub extern "C" fn __err_len() -> i32 {
    STATE.with(|s| s.borrow().errors.len() as i32)
}
