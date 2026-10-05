//! Finalize tests: the §3.6 wire encoding for values and errors, deep-force
//! with casts, badFinalResult, deep nesting (iterative traversal), and OOM
//! structured errors.

mod common;

use common::*;
use dicexp_nova_builtins::builtins::*;
use dicexp_nova_builtins::finalize::finalize;
use dicexp_nova_builtins::runtime::*;
use dicexp_nova_builtins::testutil as tu;

fn result_bytes(root: i64) -> (i32, Vec<u8>) {
    let status = finalize(root);
    let bytes = tu::read_result_bytes(result_ptr(), result_len());
    (status, bytes)
}

#[test]
fn encodes_integers_and_booleans() {
    setup();
    let (s, b) = result_bytes(tu::int(42));
    assert_eq!(s, 0);
    assert_eq!(b, vec![0x00, 42, 0, 0, 0, 0, 0, 0, 0]);

    let (s, b) = result_bytes(tu::int(-1));
    assert_eq!(s, 0);
    assert_eq!(b, vec![0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

    assert_eq!(result_bytes(tu::boolean(true)).1, vec![0x01, 0x01]);
    assert_eq!(result_bytes(tu::boolean(false)).1, vec![0x01, 0x00]);
}

#[test]
fn encodes_nested_lists() {
    setup();
    let root = list_of(&[
        tu::int(1),
        list_of(&[tu::int(2), tu::int(3)]),
        tu::boolean(true),
    ]);
    let (s, b) = result_bytes(root);
    assert_eq!(s, 0);
    let expected = vec![
        0x02, 3, 0, 0, 0, // list(3)
        0x00, 1, 0, 0, 0, 0, 0, 0, 0, // int 1
        0x02, 2, 0, 0, 0, // list(2)
        0x00, 2, 0, 0, 0, 0, 0, 0, 0, // int 2
        0x00, 3, 0, 0, 0, 0, 0, 0, 0, // int 3
        0x01, 1, // bool true
    ];
    assert_eq!(b, expected);
}

#[test]
fn encodes_error_with_string_param() {
    setup();
    let err = op_div_2(tu::int(1), tu::int(0));
    let (s, b) = result_bytes(err);
    assert_eq!(s, 1);
    let mut expected = vec![0x03, 30, 0, 0, 0, 1, 0, 0, 0, 0x01, 6, 0, 0, 0];
    expected.extend_from_slice(b"1 // 0");
    assert_eq!(b, expected);
}

#[test]
fn encodes_error_with_int_and_valtype_params() {
    setup();
    // at([1], 5) → AT_INDEX_OUT_OF_BOUNDS with two int params.
    let err = bf_at_2(list_of(&[tu::int(1)]), tu::int(5));
    let (s, b) = result_bytes(err);
    assert_eq!(s, 1);
    let mut expected = vec![0x03, 43, 0, 0, 0, 2, 0, 0, 0];
    expected.push(0x00); // tag int
    expected.extend_from_slice(&1i64.to_le_bytes());
    expected.push(0x00);
    expected.extend_from_slice(&5i64.to_le_bytes());
    assert_eq!(b, expected);

    // badFinalResult(callable) → key 23, one valtype param (callable = 3).
    let c = closure_new(const_body(tu::int(0)), 0, 0);
    let (s, b) = result_bytes(c);
    assert_eq!(s, 1);
    assert_eq!(b, vec![0x03, 23, 0, 0, 0, 1, 0, 0, 0, 0x02, 3]);
}

#[test]
fn deep_forces_thunks_and_casts_sequences() {
    setup();
    // finalize(thunk → thunk → [1, thunk → 2]) == [1, 2]
    let inner = const_body(tu::int(2));
    let list = list_of(&[tu::int(1), thunk_new(inner, 0)]);
    let mid = const_body(list);
    let outer = thunk_new(const_body(thunk_new(mid, 0)), 0);
    let (s, b) = result_bytes(outer);
    assert_eq!(s, 0);
    let expected = vec![
        0x02, 2, 0, 0, 0, //
        0x00, 1, 0, 0, 0, 0, 0, 0, 0, //
        0x00, 2, 0, 0, 0, 0, 0, 0, 0,
    ];
    assert_eq!(b, expected);

    // sequence$sum finalizes to its sum (fixture: seed 42 → 6, 6, 2 → 14).
    tu::rng_seed(42);
    let (s, b) = result_bytes(op_d_2(tu::int(3), tu::int(6)));
    assert_eq!(s, 0);
    assert_eq!(b[0], 0x00);
    assert_eq!(i64::from_le_bytes(b[1..9].try_into().unwrap()), 14);

    // repeat sequence finalizes to a list.
    let body = register_body(|_, _, _, _| op_add_2(tu::int(1), tu::int(1)));
    let c = closure_new(body, 0, 0);
    let (s, b) = result_bytes(repeat(tu::int(2), c));
    assert_eq!(s, 0);
    let expected = vec![
        0x02, 2, 0, 0, 0, //
        0x00, 2, 0, 0, 0, 0, 0, 0, 0, //
        0x00, 2, 0, 0, 0, 0, 0, 0, 0,
    ];
    assert_eq!(b, expected);
}

#[test]
fn nested_error_surfaces_from_deep_list() {
    setup();
    let err = op_mod_2(tu::int(-3), tu::int(2)); // key 31, "(-3) % 2"
    let root = list_of(&[tu::int(1), list_of(&[err])]);
    let (s, b) = result_bytes(root);
    assert_eq!(s, 1);
    let mut expected = vec![0x03, 31, 0, 0, 0, 1, 0, 0, 0, 0x01, 8, 0, 0, 0];
    expected.extend_from_slice(b"(-3) % 2");
    assert_eq!(b, expected);
}

#[test]
fn deeply_nested_lists_do_not_overflow_the_stack() {
    setup();
    const DEPTH: usize = 20_000;
    let mut v = tu::int(0);
    for _ in 0..DEPTH {
        v = list_of(&[v]);
    }
    let (s, b) = result_bytes(v);
    assert_eq!(s, 0);
    // DEPTH opens (0x02 + u32le(1)) then the integer.
    let mut expected = Vec::new();
    for _ in 0..DEPTH {
        expected.extend_from_slice(&[0x02, 1, 0, 0, 0]);
    }
    expected.extend_from_slice(&[0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert_eq!(b, expected);
}

#[test]
fn oom_produces_structured_memory_limit_error() {
    setup();
    tu::set_mem_limit(64 * 1024);
    // A huge repeat keeps allocating memo/thunks until the bump hits the cap;
    // the failure must surface as a structured error handle, never a trap.
    let body = const_body(tu::int(1));
    let c = closure_new(body, 0, 0);
    let seq = repeat(tu::int(1_000_000), c);
    let sum = bf_sum_1(seq);
    assert_eq!(err_key(sum), 40, "expected MEMORY_LIMIT_EXCEEDED, got {sum:#x}");
    assert!(err_params(sum).is_empty());
    tu::reset_mem_limit();
}

#[test]
fn reset_rewinds_the_heap() {
    setup();
    let before = tu::heap_used();
    for _ in 0..100 {
        list_of(&[tu::int(1), tu::int(2), tu::int(3)]);
    }
    assert!(tu::heap_used() > before);
    reset();
    assert_eq!(tu::heap_used(), before);
}
