//! Shared test helpers: a registry of native "compiled closure bodies" the
//! `call_closure` mock dispatches to (by `fnidx`), plus lifecycle helpers.

// Each test binary only uses a subset of these helpers.
#![allow(dead_code)]

use std::cell::RefCell;

use dicexp_nova_builtins::runtime::call_closure_mock;
use dicexp_nova_builtins::testutil as tu;
use dicexp_nova_builtins::{builtins::*, runtime::*};

pub type Body = dyn Fn(i32, i32, i32, i32) -> i64;

thread_local! {
    static BODIES: RefCell<Vec<Box<Body>>> = const { RefCell::new(Vec::new()) };
}

fn dispatch(fnidx: i32, env: i32, args: i32, argc: i32) -> i64 {
    BODIES.with(|b| b.borrow()[fnidx as usize](fnidx, env, args, argc))
}

/// Reset the heap and install the mock. Call at the start of every test.
pub fn setup() {
    reset();
    call_closure_mock::set(Some(dispatch));
}

/// Register a native body standing in for a compiled closure/thunk body;
/// returns its `fnidx`.
pub fn register_body(f: impl Fn(i32, i32, i32, i32) -> i64 + 'static) -> i32 {
    BODIES.with(|b| {
        let mut b = b.borrow_mut();
        b.push(Box::new(f));
        (b.len() - 1) as i32
    })
}

/// A body returning a constant value handle.
pub fn const_body(v: i64) -> i32 {
    register_body(move |_, _, _, _| v)
}

/// A body that errors with `op_div_2(1, 0)` (an ERROR handle), counting calls.
pub fn error_body(counter: &'static std::sync::atomic::AtomicUsize) -> i32 {
    register_body(move |_, _, _, _| {
        counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        op_div_2(tu::int(1), tu::int(0))
    })
}

/// Build a list value from handles (via the exported list_new).
pub fn list_of(elems: &[i64]) -> i64 {
    let p = list_new(elems.len() as i32);
    for (i, &e) in elems.iter().enumerate() {
        tu::write_obj_slot(p, i, e);
    }
    tu::heap_handle(p as u32)
}

pub fn err_key(v: i64) -> u32 {
    tu::error_key_of(v)
}

pub fn err_params(v: i64) -> Vec<(u8, u64)> {
    tu::error_params_of(v)
}

pub fn int_err_params(v: i64) -> Vec<i64> {
    err_params(v).into_iter().map(|(_, p)| p as i64).collect()
}
