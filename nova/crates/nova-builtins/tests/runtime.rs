//! Runtime tests: value tagging, thunk memoization, the force trampoline,
//! `call_callable` dispatch, and `repeat` (`#`).

mod common;

use std::sync::atomic::{AtomicUsize, Ordering};

use common::*;
use dicexp_nova_builtins::runtime::*;
use dicexp_nova_builtins::testutil as tu;

const MAX: i64 = 9007199254740991;

#[test]
fn value_tagging_round_trips() {
    setup();
    for v in [0, 1, -1, 42, MAX, -MAX] {
        assert_eq!(tu::int(v) >> 2, v);
        assert_eq!(tu::tag(tu::int(v)), 0);
    }
    for b in [false, true] {
        assert_eq!(tu::boolean(b) >> 2, b as i64);
        assert_eq!(tu::tag(tu::boolean(b)), 1);
    }
    let l = list_of(&[]);
    assert_eq!(tu::tag(l), 2);
    assert_eq!(tu::kind_of(l), 5); // kind::LIST
}

#[test]
fn thunk_memoization() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    let body = register_body(|_, _, _, _| {
        CALLS.fetch_add(1, Ordering::SeqCst);
        tu::int(42)
    });
    let t = thunk_new(body, 0);
    assert_eq!(force(t), tu::int(42));
    assert_eq!(force(t), tu::int(42));
    assert_eq!(CALLS.load(Ordering::SeqCst), 1, "body must run once");
    assert_eq!(tu::thunk_state_of(t), 2); // DONE
}

#[test]
fn force_collapses_thunk_chains() {
    setup();
    // Body A returns a fresh thunk of body B; B returns the answer.
    let b = const_body(tu::int(7));
    let a = register_body(move |_, _, _, _| thunk_new(b, 0));
    let t = thunk_new(a, 0);
    assert_eq!(force(t), tu::int(7));
    // The chain is memoized at each level; forcing again stays cheap.
    assert_eq!(force(t), tu::int(7));
}

#[test]
fn force_trampoline_deep_chain_no_stack_overflow() {
    setup();
    use std::cell::Cell;
    // env doubles as a depth counter; each body call returns the next thunk.
    const DEPTH: i32 = 100_000;
    thread_local! {
        static SELF: Cell<i32> = const { Cell::new(0) };
    }
    let f = register_body(|_, env, _, _| {
        if env >= DEPTH {
            tu::int(env as i64)
        } else {
            thunk_new(SELF.with(Cell::get), env + 1)
        }
    });
    SELF.with(|s| s.set(f));
    let t = thunk_new(f, 0);
    assert_eq!(force(t), tu::int(DEPTH as i64));
}

#[test]
fn thunk_error_is_memoized_and_propagates() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    let body = error_body(&CALLS);
    let t = thunk_new(body, 0);
    let e1 = force(t);
    assert_eq!(err_key(e1), 30); // ILLEGAL_OPERATION_DIV_BY_ZERO
    let e2 = force(t);
    assert_eq!(e1, e2, "memoized error handle");
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);
    assert_eq!(tu::thunk_state_of(t), 3); // ERROR
}

#[test]
fn call_callable_rejects_non_callables() {
    setup();
    for v in [tu::int(1), tu::boolean(true), list_of(&[])] {
        let e = call_callable(v, 0, 0);
        assert_eq!(err_key(e), 22); // VALUE_IS_NOT_CALLABLE
    }
    // Errors propagate instead.
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(error_body(&CALLS), 0);
    let e = call_callable(t, 0, 0);
    assert_eq!(err_key(e), 30);
}

#[test]
fn call_callable_checks_closure_arity() {
    setup();
    let body = const_body(tu::int(0));
    let c = closure_new(body, 0, 2);
    let e = call_callable(c, 0, 1);
    assert_eq!(err_key(e), 11); // WRONG_ARITY_CLOSURE
    assert_eq!(int_err_params(e), vec![2, 1]);
}

#[test]
fn call_callable_dispatches_closures_with_args() {
    setup();
    // Body: add its two args via the builtin (which forces them).
    let body = register_body(|_, _, args, argc| {
        assert_eq!(argc, 2);
        dicexp_nova_builtins::builtins::op_add_2(
            tu::read_arg_slot(args, 0),
            tu::read_arg_slot(args, 1),
        )
    });
    let c = closure_new(body, 0, 2);
    let buf = args_buf();
    tu::write_arg_slot(buf, 0, tu::int(30));
    tu::write_arg_slot(buf, 1, tu::int(12));
    assert_eq!(call_callable(c, buf, 2), tu::int(42));
}

#[test]
fn call_callable_dispatches_captures() {
    setup();
    let cap = capture_new(0, 2); // id 0 = op_add_2
    let buf = args_buf();
    tu::write_arg_slot(buf, 0, tu::int(20));
    tu::write_arg_slot(buf, 1, tu::int(22));
    assert_eq!(call_callable(cap, buf, 2), tu::int(42));

    // Wrong arity for the captured builtin.
    let e = call_callable(cap, buf, 1);
    assert_eq!(err_key(e), 12); // WRONG_ARITY_CAPTURED
    assert_eq!(int_err_params(e), vec![2, 1]);

    // A lazy-param builtin through a capture: &and/2 short-circuits.
    let and = capture_new(14, 2); // id 14 = op_and_2
    static RHS_CALLS: AtomicUsize = AtomicUsize::new(0);
    RHS_CALLS.store(0, Ordering::SeqCst);
    let rhs = thunk_new(error_body(&RHS_CALLS), 0);
    tu::write_arg_slot(buf, 0, tu::boolean(false));
    tu::write_arg_slot(buf, 1, rhs);
    assert_eq!(call_callable(and, buf, 2), tu::boolean(false));
    assert_eq!(RHS_CALLS.load(Ordering::SeqCst), 0, "RHS must stay unforced");
}

#[test]
fn repeat_requires_integer_count() {
    setup();
    let body = const_body(tu::int(1));
    let c = closure_new(body, 0, 0);
    let e = repeat(tu::boolean(true), c);
    assert_eq!(err_key(e), 49); // REPEAT_COUNT_TYPE_MISMATCH
    assert_eq!(err_params(e), vec![(2, 1)]); // valtype boolean
}

#[test]
fn repeat_zero_count_is_empty_list() {
    setup();
    let body = const_body(tu::int(1));
    let c = closure_new(body, 0, 0);
    let v = repeat(tu::int(0), c);
    assert_eq!(tu::kind_of(v), 5); // LIST
    assert_eq!(tu::list_len_of(v), 0);
}

#[test]
fn repeat_elements_are_lazy_and_memoized() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    let body = register_body(|_, _, _, _| {
        let n = CALLS.fetch_add(1, Ordering::SeqCst) + 1;
        tu::int(n as i64)
    });
    let c = closure_new(body, 0, 0);
    let seq = repeat(tu::int(3), c);
    assert_eq!(tu::kind_of(seq), 8); // SEQUENCE
    assert_eq!(CALLS.load(Ordering::SeqCst), 0, "body must not run eagerly");

    // Cast to list via sum: elements evaluate in order (1, 2, 3) → 6.
    let sum = dicexp_nova_builtins::builtins::bf_sum_1(seq);
    assert_eq!(sum, tu::int(6));
    assert_eq!(CALLS.load(Ordering::SeqCst), 3);

    // Casting again reuses memoized elements (no re-evaluation).
    let sum2 = dicexp_nova_builtins::builtins::bf_sum_1(seq);
    assert_eq!(sum2, tu::int(6));
    assert_eq!(CALLS.load(Ordering::SeqCst), 3);
}

#[test]
fn env_and_list_new_return_writable_buffers() {
    setup();
    let e = env_new(0, 2);
    tu::write_obj_slot(e, 0, tu::int(11));
    tu::write_obj_slot(e, 1, tu::int(22));
    assert_eq!(tu::read_arg_slot(e + 8, 0), tu::int(11));
    assert_eq!(tu::read_arg_slot(e + 8, 1), tu::int(22));

    let l = list_new(2);
    tu::write_obj_slot(l, 0, tu::int(1));
    tu::write_obj_slot(l, 1, tu::int(2));
    let h = tu::heap_handle(l as u32);
    assert_eq!(tu::list_len_of(h), 2);
    assert_eq!(tu::list_elem_of(h, 1), tu::int(2));
}

#[test]
fn version_returns_abi_version() {
    setup();
    assert_eq!(version(), 1);
}
