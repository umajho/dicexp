//! v0.7 builtin tests (contracts: nova/docs/v0.7-contracts.md): the 25 new
//! builtins (ids 36–60) and boolean-accepting comparison operators — happy
//! paths, edge cases, laziness non-forcing, short-circuit stops, error
//! keys/params, RNG-consumption pinning, and the foldr/sequence machinery.

mod common;

use std::sync::atomic::{AtomicUsize, Ordering};

use common::*;
use dicexp_nova_builtins::builtins::*;
use dicexp_nova_builtins::runtime::*;
use dicexp_nova_builtins::testutil as tu;

const MIN: i64 = -9007199254740991;
const MAX: i64 = 9007199254740991;

// --- operators: booleans in comparisons --------------------------------------

#[test]
fn comparisons_accept_booleans() {
    setup();
    assert_eq!(op_lt_2(tu::boolean(false), tu::boolean(true)), tu::boolean(true));
    assert_eq!(op_lt_2(tu::boolean(true), tu::boolean(false)), tu::boolean(false));
    assert_eq!(op_gt_2(tu::boolean(true), tu::boolean(false)), tu::boolean(true));
    assert_eq!(op_le_2(tu::boolean(false), tu::boolean(false)), tu::boolean(true));
    assert_eq!(op_ge_2(tu::boolean(true), tu::boolean(false)), tu::boolean(true));
    assert_eq!(op_le_2(tu::boolean(true), tu::boolean(false)), tu::boolean(false));
    // Ints still compare.
    assert_eq!(op_lt_2(tu::int(1), tu::int(2)), tu::boolean(true));

    // Mixed operand types → key 42 with the bare rendered operator.
    let e = op_lt_2(tu::int(1), tu::boolean(true));
    assert_eq!(err_key(e), 42);
    assert_eq!(tu::string_param_of(e, 0), "<");
    let e = op_gt_2(tu::boolean(true), tu::int(1));
    assert_eq!(err_key(e), 42);
    assert_eq!(tu::string_param_of(e, 0), ">");
    let e = op_le_2(tu::int(1), tu::boolean(false));
    assert_eq!(err_key(e), 42);
    assert_eq!(tu::string_param_of(e, 0), "<=");
    let e = op_ge_2(tu::boolean(false), tu::int(1));
    assert_eq!(err_key(e), 42);
    assert_eq!(tu::string_param_of(e, 0), ">=");

    // Non-scalar operands still fail the parameter spec (pos 1, int|bool).
    let e = op_lt_2(list_of(&[]), tu::int(1));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b11), (2, 2)]);
}

// --- scalar / utility ---------------------------------------------------------

#[test]
fn abs_basics() {
    setup();
    assert_eq!(bf_abs_1(tu::int(-5)), tu::int(5));
    assert_eq!(bf_abs_1(tu::int(0)), tu::int(0));
    assert_eq!(bf_abs_1(tu::int(MIN)), tu::int(MAX));
    assert_eq!(bf_abs_1(tu::int(MAX)), tu::int(MAX));
    assert_eq!(err_key(bf_abs_1(list_of(&[]))), 21);
    // E param: thunk args are forced.
    assert_eq!(bf_abs_1(thunk_new(const_body(tu::int(-2)), 0)), tu::int(2));
}

#[test]
fn count1_length_without_forcing() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let erring = thunk_new(error_body(&CALLS), 0);
    let list = list_of(&[erring, tu::int(2)]);
    assert_eq!(bf_count_1(list), tu::int(2));
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::thunk_state_of(erring), 0);
    assert_eq!(bf_count_1(list_of(&[])), tu::int(0));
    // List-typed param: a plain sequence casts to a list (pulling nominal
    // positions) WITHOUT forcing elements — no RNG.
    tu::rng_seed(0);
    let d6 = closure_new(register_body(|_, _, _, _| op_d_1(tu::int(6))), 0, 0);
    assert_eq!(bf_count_1(repeat(tu::int(3), d6)), tu::int(3));
    assert_eq!(tu::rng_integer(1, 6), 4, "no RNG consumed");
}

#[test]
fn has2_scan_semantics() {
    setup();
    let list = list_of(&[tu::int(1), tu::int(2), tu::int(3)]);
    assert_eq!(bf_has_2(list, tu::int(2)), tu::boolean(true));
    assert_eq!(bf_has_2(list, tu::int(4)), tu::boolean(false));
    assert_eq!(bf_has_2(list_of(&[]), tu::int(1)), tu::boolean(false));
    assert_eq!(bf_has_2(list_of(&[tu::boolean(true)]), tu::boolean(true)), tu::boolean(true));
    // Cross-type scalar elements are simply unequal (no error, unlike ==).
    assert_eq!(bf_has_2(list, tu::boolean(true)), tu::boolean(false));
    assert_eq!(bf_has_2(list_of(&[tu::boolean(true)]), tu::int(1)), tu::boolean(false));
    // Non-scalar element → key 50.
    assert_eq!(err_key(bf_has_2(list_of(&[list_of(&[])]), tu::int(1))), 50);
    // The needle x itself must be scalar (pos 2).
    let e = bf_has_2(list, list_of(&[]));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 2), (3, 0b11), (2, 2)]);
}

#[test]
fn has2_short_circuits_and_casts() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let erring = thunk_new(error_body(&CALLS), 0);
    let list = list_of(&[tu::int(2), erring]);
    // First match → true; the erroring element is never forced.
    assert_eq!(bf_has_2(list, tu::int(2)), tu::boolean(true));
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::thunk_state_of(erring), 0);
    // An element error BEFORE a match propagates.
    let e = bf_has_2(list, tu::int(3));
    assert_eq!(err_key(e), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);
    // Element-level implicit casts: 2d6 (seed 0 → 4+3 = 7).
    tu::rng_seed(0);
    assert_eq!(
        bf_has_2(list_of(&[op_d_2(tu::int(2), tu::int(6))]), tu::int(7)),
        tu::boolean(true)
    );
}

#[test]
fn min_max_semantics() {
    setup();
    let list = list_of(&[tu::int(3), tu::int(-1), tu::int(2)]);
    assert_eq!(bf_min_1(list), tu::int(-1));
    assert_eq!(bf_max_1(list), tu::int(3));
    assert_eq!(bf_min_1(list_of(&[tu::int(5)])), tu::int(5));
    // Empty → key 44.
    assert_eq!(err_key(bf_min_1(list_of(&[]))), 44);
    assert_eq!(err_key(bf_max_1(list_of(&[]))), 44);
    // Non-integer items → key 45 (booleans not accepted, unlike sort/1).
    assert_eq!(err_key(bf_min_1(list_of(&[tu::int(1), tu::boolean(true)]))), 45);
    assert_eq!(err_key(bf_max_1(list_of(&[list_of(&[])]))), 45);
    // Implicit casts per element: 2d6 (seed 0) = 7.
    tu::rng_seed(0);
    let dice = list_of(&[op_d_2(tu::int(2), tu::int(6)), tu::int(1)]);
    assert_eq!(bf_min_1(dice), tu::int(1));
    assert_eq!(bf_max_1(dice), tu::int(7));
}

#[test]
fn all1_semantics_and_short_circuit() {
    setup();
    assert_eq!(bf_all_1(list_of(&[])), tu::boolean(true));
    assert_eq!(bf_all_1(list_of(&[tu::boolean(true)])), tu::boolean(true));
    let nested =
        list_of(&[tu::boolean(true), list_of(&[tu::boolean(true), tu::boolean(true)])]);
    assert_eq!(bf_all_1(nested), tu::boolean(true));
    // Non-boolean leaf → key 46.
    assert_eq!(err_key(bf_all_1(list_of(&[tu::int(1)]))), 46);

    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let erring = thunk_new(error_body(&CALLS), 0);
    // A `false` (nested anywhere) stops the scan — div1 short-circuit.
    let list = list_of(&[list_of(&[tu::boolean(false)]), erring]);
    assert_eq!(bf_all_1(list), tu::boolean(false));
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::thunk_state_of(erring), 0);

    // No `false`: everything is forced, so the error is reached.
    let e = bf_all_1(list_of(&[tu::boolean(true), erring]));
    assert_eq!(err_key(e), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);

    // The short-circuit also skips implicit casts of dice behind the false.
    tu::rng_seed(0);
    assert_eq!(
        bf_all_1(list_of(&[tu::boolean(false), op_d_2(tu::int(3), tu::int(6))])),
        tu::boolean(false)
    );
    assert_eq!(tu::rng_integer(1, 6), 4, "no RNG consumed");
}

// --- ordering / reshaping -----------------------------------------------------

#[test]
fn sort2_orders_by_comparator() {
    setup();
    let le = closure_new(
        register_body(|_, _, args, _| {
            op_le_2(tu::read_arg_slot(args, 0), tu::read_arg_slot(args, 1))
        }),
        0,
        2,
    );
    let out = bf_sort_2(list_of(&[tu::int(3), tu::int(1), tu::int(2)]), le);
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(1));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(2));
    assert_eq!(tu::list_elem_of(out, 2), tu::int(3));

    let ge = closure_new(
        register_body(|_, _, args, _| {
            op_ge_2(tu::read_arg_slot(args, 0), tu::read_arg_slot(args, 1))
        }),
        0,
        2,
    );
    let out = bf_sort_2(list_of(&[tu::int(3), tu::int(1), tu::int(2)]), ge);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(3));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(2));
    assert_eq!(tu::list_elem_of(out, 2), tu::int(1));

    assert_eq!(tu::list_len_of(bf_sort_2(list_of(&[]), le)), 0);
    assert_eq!(tu::list_len_of(bf_sort_2(list_of(&[tu::int(1)]), le)), 1);
}

#[test]
fn sort2_is_stable_and_lazy() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t1 = thunk_new(const_body(tu::int(1)), 0);
    let t2 = thunk_new(const_body(tu::int(2)), 0);
    let t3 = thunk_new(const_body(tu::int(3)), 0);

    // Always-true comparator ("everything in order"): STABLE — the input
    // order is preserved; elements are never forced (pure comparator).
    let always = closure_new(const_body(tu::boolean(true)), 0, 2);
    let out = bf_sort_2(list_of(&[t1, t2, t3]), always);
    assert_eq!(tu::list_elem_of(out, 0), t1);
    assert_eq!(tu::list_elem_of(out, 1), t2);
    assert_eq!(tu::list_elem_of(out, 2), t3);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::thunk_state_of(t1), 0);

    // Always-false comparator: reversed.
    let never = closure_new(const_body(tu::boolean(false)), 0, 2);
    let out = bf_sort_2(list_of(&[t1, t2, t3]), never);
    assert_eq!(tu::list_elem_of(out, 0), t3);
    assert_eq!(tu::list_elem_of(out, 1), t2);
    assert_eq!(tu::list_elem_of(out, 2), t1);
}

#[test]
fn sort2_error_shapes() {
    setup();
    // Non-boolean comparator result → key 48 (pos 2, sort/2, bool, actual).
    let bad = closure_new(const_body(tu::int(1)), 0, 2);
    let e = bf_sort_2(list_of(&[tu::int(2), tu::int(1)]), bad);
    assert_eq!(err_key(e), 48);
    let params = err_params(e);
    assert_eq!(params[0], (0, 2));
    assert_eq!(tu::string_param_of(e, 1), "sort/2");
    assert_eq!(params[2], (2, 1)); // expected BOOLEAN
    assert_eq!(params[3], (2, 0)); // actual INTEGER

    // A comparator error aborts the sort with that error.
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let erring = closure_new(error_body(&CALLS), 0, 2);
    let e = bf_sort_2(list_of(&[tu::int(2), tu::int(1), tu::int(3)]), erring);
    assert_eq!(err_key(e), 30);
}

#[test]
fn reverse_concat_prepend() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(const_body(tu::int(9)), 0);
    let list = list_of(&[tu::int(1), t, tu::int(3)]);

    let out = bf_reverse_1(list);
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(3));
    assert_eq!(tu::list_elem_of(out, 1), t, "handles reversed, still unforced");
    assert_eq!(tu::list_elem_of(out, 2), tu::int(1));
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::list_len_of(bf_reverse_1(list_of(&[]))), 0);

    let cat = bf_concat_2(list_of(&[tu::int(1)]), list_of(&[tu::int(2), tu::int(3)]));
    assert_eq!(tu::list_len_of(cat), 3);
    assert_eq!(tu::list_elem_of(cat, 2), tu::int(3));
    assert_eq!(tu::list_len_of(bf_concat_2(list_of(&[]), list_of(&[]))), 0);
    // Arg 2 must be a list too (E param).
    assert_eq!(err_key(bf_concat_2(list_of(&[]), tu::int(1))), 21);

    let pre = bf_prepend_2(list_of(&[tu::int(2)]), t);
    assert_eq!(tu::list_len_of(pre), 2);
    assert_eq!(tu::list_elem_of(pre, 0), t, "prepended element stays unforced");
    assert_eq!(tu::thunk_state_of(tu::list_elem_of(pre, 0)), 0);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
}

#[test]
fn at3_last_init() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(const_body(tu::int(20)), 0);
    let def = thunk_new(const_body(tu::int(99)), 0);
    let list = list_of(&[tu::int(1), t]);

    // In-bounds: the element handle, unforced.
    assert_eq!(bf_at_3(list, tu::int(1), def), t);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    // OOB / negative: the DEFAULT handle, unforced — never an error.
    assert_eq!(bf_at_3(list, tu::int(5), def), def);
    assert_eq!(bf_at_3(list, tu::int(-1), def), def);
    assert_eq!(tu::thunk_state_of(def), 0);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    // A bad index type still errors (pos 2).
    assert_eq!(err_key(bf_at_3(list, tu::boolean(true), def)), 21);

    let list2 = list_of(&[tu::int(1), tu::int(2), tu::int(3)]);
    assert_eq!(bf_last_1(list2), tu::int(3));
    assert_eq!(bf_last_1(list), t, "last stays unforced");
    assert_eq!(err_key(bf_last_1(list_of(&[]))), 44);
    let init = bf_init_1(list2);
    assert_eq!(tu::list_len_of(init), 2);
    assert_eq!(tu::list_elem_of(init, 1), tu::int(2));
    assert_eq!(err_key(bf_init_1(list_of(&[]))), 44);
}

#[test]
fn duplicate_pins_the_value() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(
        register_body(|_, _, _, _| {
            CALLS.fetch_add(1, Ordering::SeqCst);
            tu::int(7)
        }),
        0,
    );
    let out = bf_duplicate_2(t, tu::int(3));
    assert_eq!(tu::list_len_of(out), 3);
    // The SAME handle repeated.
    assert_eq!(tu::list_elem_of(out, 0), t);
    assert_eq!(tu::list_elem_of(out, 1), t);
    assert_eq!(tu::list_elem_of(out, 2), t);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    // Pinned: one evaluation when consumed.
    assert_eq!(bf_sum_1(out), tu::int(21));
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);

    assert_eq!(tu::list_len_of(bf_duplicate_2(t, tu::int(0))), 0);
    assert_eq!(tu::list_len_of(bf_duplicate_2(t, tu::int(-2))), 0);
    // Count is an E param (pos 2).
    assert_eq!(err_key(bf_duplicate_2(t, tu::boolean(true))), 21);
}

#[test]
fn duplicate_d6_rolls_once() {
    setup();
    tu::rng_seed(0);
    // duplicate(d6, 3) |> sum = 3 × one roll (3#d6 would roll 3 times).
    let out = bf_duplicate_2(op_d_1(tu::int(6)), tu::int(3));
    assert_eq!(bf_sum_1(out), tu::int(12)); // 3 × 4
    assert_eq!(tu::rng_integer(1, 6), 3, "exactly one roll consumed");
}

// --- flatten -------------------------------------------------------------------

#[test]
fn flatten_depth_zero_is_shallow_copy() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(const_body(tu::int(1)), 0);
    let list = list_of(&[t, list_of(&[tu::int(2)])]);
    let out = bf_flatten_2(list, tu::int(0));
    assert_eq!(tu::list_len_of(out), 2);
    assert_eq!(tu::list_elem_of(out, 0), t);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    // Negative depth behaves the same (depth ≤ 0 → shallow copy).
    let out = bf_flatten_2(list, tu::int(-1));
    assert_eq!(tu::list_len_of(out), 2);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
}

#[test]
fn flatten_forcing_rule() {
    setup();
    tu::rng_seed(0);
    // flatten([d6], 1) DRAWS: the element is forced past the boundary to
    // test listness (the sequence$sum casts to its sum).
    let out = bf_flatten_2(list_of(&[op_d_1(tu::int(6))]), tu::int(1));
    assert_eq!(tu::list_len_of(out), 1);
    // The ORIGINAL handle is kept (the memoized sequence$sum).
    assert_eq!(op_add_2(tu::list_elem_of(out, 0), tu::int(0)), tu::int(4));
    assert_eq!(tu::rng_integer(1, 6), 3, "exactly one roll consumed");

    // flatten([[d6]], 1) does NOT draw: elements at the boundary stay
    // unforced. (The roll assertion above consumed the 2nd fixture roll,
    // so the next one is the 3rd.)
    let inner = list_of(&[op_d_1(tu::int(6))]);
    let out = bf_flatten_2(list_of(&[inner]), tu::int(1));
    assert_eq!(tu::list_len_of(out), 1);
    assert_eq!(tu::list_elem_of(out, 0), tu::list_elem_of(inner, 0));
    assert_eq!(tu::rng_integer(1, 6), 5, "no roll for the boundary element");
}

#[test]
fn flatten_nested_and_non_lists_keep_original_handles() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(const_body(tu::int(5)), 0);
    let nested = list_of(&[list_of(&[tu::int(1), list_of(&[tu::int(2)])]), t]);

    let out = bf_flatten_2(nested, tu::int(2));
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(1));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(2));
    // Non-list elements keep their ORIGINAL handle, unforced.
    assert_eq!(tu::list_elem_of(out, 2), t);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);

    // Depth 1 splices the outer element's handles at the boundary: the
    // inner-inner list survives as an element.
    let out = bf_flatten_2(nested, tu::int(1));
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(1));
    assert_eq!(tu::kind_of(tu::list_elem_of(out, 1)), 5); // still a list
    assert_eq!(tu::list_elem_of(out, 2), t);

    // Element errors above the boundary propagate.
    let erring = thunk_new(error_body(&CALLS), 0);
    let e = bf_flatten_2(list_of(&[erring]), tu::int(1));
    assert_eq!(err_key(e), 30);
}

#[test]
fn flatten_all() {
    setup();
    let nested = list_of(&[list_of(&[tu::int(1), list_of(&[tu::int(2)])]), tu::int(3)]);
    let out = bf_flattenAll_1(nested);
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(1));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(2));
    assert_eq!(tu::list_elem_of(out, 2), tu::int(3));
    assert_eq!(tu::list_len_of(bf_flattenAll_1(list_of(&[]))), 0);
    assert_eq!(tu::list_len_of(bf_flattenAll_1(list_of(&[tu::int(1)]))), 1);

    // Deep nesting: iterative DFS, no native recursion.
    let mut deep = tu::int(0);
    for _ in 0..2000 {
        deep = list_of(&[deep]);
    }
    let out = bf_flattenAll_1(list_of(&[deep]));
    assert_eq!(tu::list_len_of(out), 1);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(0));

    // Errors propagate from any depth.
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let erring = thunk_new(error_body(&CALLS), 0);
    let e = bf_flattenAll_1(list_of(&[list_of(&[list_of(&[erring])])]));
    assert_eq!(err_key(e), 30);
}

// --- flatMap -------------------------------------------------------------------

#[test]
fn flat_map_splices_step_lists() {
    setup();
    // f = |x| [x, x].
    let body = register_body(|_, _, args, _| {
        let x = tu::read_arg_slot(args, 0);
        list_of(&[x, x])
    });
    let f = closure_new(body, 0, 1);
    let out = bf_flatMap_2(list_of(&[tu::int(1), tu::int(2)]), f);
    assert_eq!(tu::list_len_of(out), 4);
    assert_eq!(tu::list_elem_of(out, 3), tu::int(2));

    let empty_step = closure_new(const_body(list_of(&[])), 0, 1);
    assert_eq!(tu::list_len_of(bf_flatMap_2(list_of(&[tu::int(1)]), empty_step)), 0);

    // Non-list step result → key 48 (pos 2, flatMap/2, LIST, INTEGER).
    let bad = closure_new(const_body(tu::int(1)), 0, 1);
    let e = bf_flatMap_2(list_of(&[tu::int(1)]), bad);
    assert_eq!(err_key(e), 48);
    let params = err_params(e);
    assert_eq!(params[0], (0, 2));
    assert_eq!(tu::string_param_of(e, 1), "flatMap/2");
    assert_eq!(params[2], (2, 2)); // expected LIST
    assert_eq!(params[3], (2, 0)); // actual INTEGER

    // An f error aborts (no partial result).
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let erring = closure_new(error_body(&CALLS), 0, 1);
    let e = bf_flatMap_2(list_of(&[tu::int(1), tu::int(2)]), erring);
    assert_eq!(err_key(e), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);

    // Inner element handles are appended unforced.
    static CALLS2: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(const_body(tu::int(7)), 0);
    let step = register_body(move |_, _, _, _| list_of(&[t]));
    let out = bf_flatMap_2(list_of(&[tu::int(0)]), closure_new(step, 0, 1));
    assert_eq!(tu::list_len_of(out), 1);
    assert_eq!(tu::list_elem_of(out, 0), t);
    assert_eq!(tu::thunk_state_of(t), 0);
    assert_eq!(CALLS2.load(Ordering::SeqCst), 0);

    // A plain-sequence step result implicitly casts to a list.
    let one = const_body(tu::int(1));
    let seq_step = register_body(move |_, _, _, _| repeat(tu::int(2), closure_new(one, 0, 0)));
    let out = bf_flatMap_2(list_of(&[tu::int(0)]), closure_new(seq_step, 0, 1));
    assert_eq!(tu::list_len_of(out), 2);
}

// --- folds ---------------------------------------------------------------------

#[test]
fn foldl_order_and_result() {
    setup();
    // f(acc, x) = acc*10 + x over [1,2,3,4] → 1234 (left-to-right).
    let body = register_body(|_, _, args, _| {
        op_add_2(
            op_mul_2(tu::read_arg_slot(args, 0), tu::int(10)),
            tu::read_arg_slot(args, 1),
        )
    });
    let f = closure_new(body, 0, 2);
    let r = bf_foldl_3(list_of(&[tu::int(1), tu::int(2), tu::int(3), tu::int(4)]), tu::int(0), f);
    // Strict accumulator: the result is a plain value, not a thunk.
    assert_eq!(r, tu::int(1234));
}

#[test]
fn foldl_empty_and_errors() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    // Empty list → the init handle, unforced.
    let t = thunk_new(const_body(tu::int(7)), 0);
    let f = closure_new(const_body(tu::int(0)), 0, 2);
    assert_eq!(bf_foldl_3(list_of(&[]), t, f), t);
    assert_eq!(tu::thunk_state_of(t), 0);

    // An error stops the fold and IS the result.
    let erring = closure_new(error_body(&CALLS), 0, 2);
    let e = bf_foldl_3(list_of(&[tu::int(1), tu::int(2), tu::int(3)]), tu::int(0), erring);
    assert_eq!(err_key(e), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);
}

#[test]
fn foldr_defers_calls() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    // Returns $x (ignoring $acc) and ERRORS on any element other than the
    // leftmost — eager evaluation (foldl-style) would fail here.
    let body = register_body(|_, _, args, _| {
        CALLS.fetch_add(1, Ordering::SeqCst);
        let x = tu::read_arg_slot(args, 0);
        if x == tu::int(1) {
            x
        } else {
            op_div_2(tu::int(1), tu::int(0))
        }
    });
    let f = closure_new(body, 0, 2);
    let r = bf_foldr_3(list_of(&[tu::int(1), tu::int(2), tu::int(3)]), tu::int(0), f);
    // Deferred: the result is a THUNK; f was not called yet.
    assert_eq!(tu::kind_of(r), 1);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    // Forcing runs exactly the leftmost step.
    assert_eq!(force(r), tu::int(1));
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);
}

#[test]
fn foldr_full_evaluation() {
    setup();
    // f(elem, acc) = elem + acc — forces the whole chain, right-to-left.
    let body = register_body(|_, _, args, _| {
        op_add_2(tu::read_arg_slot(args, 0), tu::read_arg_slot(args, 1))
    });
    let f = closure_new(body, 0, 2);
    let r = bf_foldr_3(list_of(&[tu::int(1), tu::int(2), tu::int(3)]), tu::int(0), f);
    assert_eq!(force(r), tu::int(6));

    // Errors from the closure surface at force time.
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let erring = closure_new(error_body(&CALLS), 0, 2);
    let r = bf_foldr_3(list_of(&[tu::int(1)]), tu::int(0), erring);
    assert_eq!(err_key(force(r)), 30);
}

#[test]
fn foldr_empty_returns_init_unforced() {
    setup();
    let t = thunk_new(const_body(tu::int(9)), 0);
    let f = closure_new(const_body(tu::int(0)), 0, 2);
    let r = bf_foldr_3(list_of(&[]), t, f);
    assert_eq!(r, t);
    assert_eq!(tu::thunk_state_of(r), 0);
    assert_eq!(force(r), tu::int(9));
}

#[test]
fn foldr_acc_returning_bodies_chain_iteratively() {
    setup();
    // f(elem, acc) = acc: a 5000-deep chain of UNFORCED bodies is chased
    // by the root force loop (trampoline) in bounded stack (compat #6).
    let body = register_body(|_, _, args, _| tu::read_arg_slot(args, 1));
    let f = closure_new(body, 0, 2);
    let n = 5000;
    let mut elems = Vec::with_capacity(n);
    for i in 0..n {
        elems.push(tu::int(i as i64));
    }
    let r = bf_foldr_3(list_of(&elems), tu::int(123), f);
    assert_eq!(force(r), tu::int(123));
}

// --- iterate -------------------------------------------------------------------

#[test]
fn iterate_basics() {
    setup();
    let inc = closure_new(
        register_body(|_, _, args, _| op_add_2(tu::read_arg_slot(args, 0), tu::int(1))),
        0,
        1,
    );
    let it = bf_iterate_2(tu::int(1), inc);
    assert_eq!(tu::kind_of(it), 8); // SEQUENCE
    let out = bf_take_2(it, tu::int(3));
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(1));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(2));
    assert_eq!(tu::list_elem_of(out, 2), tu::int(3));
}

#[test]
fn iterate_construction_pulls_nothing() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(error_body(&CALLS), 0);
    let f = closure_new(const_body(tu::int(1)), 0, 1);
    let it = bf_iterate_2(t, f);
    assert_eq!(tu::kind_of(it), 8);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0, "start not forced yet");
    assert_eq!(tu::thunk_state_of(t), 0);
    // The first pull forces the start: its error is a TERMINAL item.
    let out = bf_take_2(it, tu::int(2));
    assert_eq!(tu::list_len_of(out), 1);
    assert_eq!(err_key(tu::list_elem_of(out, 0)), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);
}

#[test]
fn iterate_is_strict_per_pull() {
    setup();
    let inc = closure_new(
        register_body(|_, _, args, _| op_add_2(tu::read_arg_slot(args, 0), tu::int(1))),
        0,
        1,
    );
    // A deep chain: every item is forced + memoized before the next step,
    // so the final sum never chases an N-deep thunk chain.
    let it = bf_iterate_2(tu::int(0), inc);
    let out = bf_take_2(it, tu::int(2000));
    assert_eq!(tu::list_len_of(out), 2000);
    assert_eq!(bf_sum_1(out), tu::int(1_999_000)); // Σ 0..1999
}

#[test]
fn iterate_f_error_is_terminal() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let body = register_body(|_, _, args, _| {
        let n = CALLS.fetch_add(1, Ordering::SeqCst);
        if n == 0 {
            op_add_2(tu::read_arg_slot(args, 0), tu::int(1))
        } else {
            op_div_2(tu::int(1), tu::int(0))
        }
    });
    let it = bf_iterate_2(tu::int(1), closure_new(body, 0, 1));
    let out = bf_take_2(it, tu::int(3));
    // [1, 2, <error>: marked last; the stream ends after it].
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(1));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(2));
    assert_eq!(err_key(tu::list_elem_of(out, 2)), 30);
    // Further pulls produce nothing.
    let out2 = bf_take_2(it, tu::int(5));
    assert_eq!(tu::list_len_of(out2), 3);
    assert_eq!(CALLS.load(Ordering::SeqCst), 2);
}

// --- unfold --------------------------------------------------------------------

#[test]
fn unfold_countdown() {
    setup();
    let countdown = closure_new(
        register_body(|_, _, args, _| {
            let n = tu::read_arg_slot(args, 0);
            if op_gt_2(n, tu::int(0)) == tu::boolean(true) {
                list_of(&[n, op_sub_2(n, tu::int(1))])
            } else {
                tu::boolean(false)
            }
        }),
        0,
        1,
    );
    let s = bf_unfold_2(tu::int(3), countdown);
    assert_eq!(tu::kind_of(s), 8);
    // take pulls past the `false` boundary → exactly the items.
    let out = bf_take_2(s, tu::int(10));
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(3));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(2));
    assert_eq!(tu::list_elem_of(out, 2), tu::int(1));
    // Casting a finite unfold to a list yields exactly its items.
    assert_eq!(bf_count_1(bf_unfold_2(tu::int(3), countdown)), tu::int(3));
}

#[test]
fn unfold_yields_elements_unforced() {
    setup();
    let elem_body = const_body(tu::int(42));
    let body = register_body(move |_, _, args, _| {
        let seed = tu::read_arg_slot(args, 0);
        if seed == tu::int(0) {
            tu::boolean(false)
        } else {
            list_of(&[thunk_new(elem_body, 0), op_sub_2(seed, tu::int(1))])
        }
    });
    let s = bf_unfold_2(tu::int(2), closure_new(body, 0, 1));
    let out = bf_take_2(s, tu::int(1));
    assert_eq!(tu::list_len_of(out), 1);
    assert_eq!(tu::kind_of(tu::list_elem_of(out, 0)), 1, "elem stays a thunk");
    assert_eq!(tu::thunk_state_of(tu::list_elem_of(out, 0)), 0);
    assert_eq!(force(tu::list_elem_of(out, 0)), tu::int(42));
}

#[test]
fn unfold_step_errors() {
    setup();
    // Non-list, non-false step → key 51 (valtype actual).
    let int_step = closure_new(const_body(tu::int(1)), 0, 1);
    let out = bf_take_2(bf_unfold_2(tu::int(0), int_step), tu::int(5));
    assert_eq!(tu::list_len_of(out), 1, "terminal item only");
    let e = tu::list_elem_of(out, 0);
    assert_eq!(err_key(e), 51);
    assert_eq!(err_params(e), vec![(2, 0)]); // VALUE_TYPE INTEGER

    // `true` is a step error too (only `false` ends the stream).
    let true_step = closure_new(const_body(tu::boolean(true)), 0, 1);
    let e = tu::list_elem_of(bf_take_2(bf_unfold_2(tu::int(0), true_step), tu::int(5)), 0);
    assert_eq!(err_key(e), 51);
    assert_eq!(err_params(e), vec![(2, 1)]); // VALUE_TYPE BOOLEAN

    // Wrong-length step list → key 52 (int actual_len).
    let short = closure_new(const_body(list_of(&[tu::int(1)])), 0, 1);
    let e = tu::list_elem_of(bf_take_2(bf_unfold_2(tu::int(0), short), tu::int(5)), 0);
    assert_eq!(err_key(e), 52);
    assert_eq!(err_params(e), vec![(0, 1)]);
    let long = closure_new(const_body(list_of(&[tu::int(1), tu::int(2), tu::int(3)])), 0, 1);
    let e = tu::list_elem_of(bf_take_2(bf_unfold_2(tu::int(0), long), tu::int(5)), 0);
    assert_eq!(err_key(e), 52);
    assert_eq!(err_params(e), vec![(0, 3)]);
}

#[test]
fn unfold_f_and_seed_errors_are_terminal() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    // f error → terminal item; nothing after it.
    let erring = closure_new(error_body(&CALLS), 0, 1);
    let out = bf_take_2(bf_unfold_2(tu::int(0), erring), tu::int(3));
    assert_eq!(tu::list_len_of(out), 1);
    assert_eq!(err_key(tu::list_elem_of(out, 0)), 30);

    // Seed error → terminal item; f is never called.
    let seed_err = thunk_new(error_body(&CALLS), 0);
    let ok = closure_new(const_body(tu::boolean(false)), 0, 1);
    let out = bf_take_2(bf_unfold_2(seed_err, ok), tu::int(3));
    assert_eq!(tu::list_len_of(out), 1);
    assert_eq!(err_key(tu::list_elem_of(out, 0)), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 2); // only the two error bodies
}

#[test]
fn unfold_construction_pulls_nothing() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let seed_thunk = thunk_new(error_body(&CALLS), 0);
    let f = closure_new(const_body(tu::boolean(false)), 0, 1);
    let s = bf_unfold_2(seed_thunk, f);
    assert_eq!(tu::kind_of(s), 8);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::thunk_state_of(seed_thunk), 0);
}

// --- take / drop -----------------------------------------------------------------

#[test]
fn take_on_sequences_pulls_actual_positions() {
    setup();
    // take(d6, 3) = 3 rolls (pulls past the nominal end of 1).
    tu::rng_seed(0);
    let out = bf_take_2(op_d_1(tu::int(6)), tu::int(3));
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(4));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(3));
    assert_eq!(tu::list_elem_of(out, 2), tu::int(5));

    // n ≤ 0 → [] with nothing pulled (no RNG; the fixture's 4th roll
    // follows the three consumed above).
    let out = bf_take_2(op_d_1(tu::int(6)), tu::int(0));
    assert_eq!(tu::list_len_of(out), 0);
    assert_eq!(tu::rng_integer(1, 6), 1, "no RNG consumed");
    let out = bf_take_2(op_d_1(tu::int(6)), tu::int(-1));
    assert_eq!(tu::list_len_of(out), 0);
}

#[test]
fn take_on_repeat_yields_unforced_thunks() {
    setup();
    tu::rng_seed(0);
    let d6 = closure_new(register_body(|_, _, _, _| op_d_1(tu::int(6))), 0, 0);
    let out = bf_take_2(repeat(tu::int(3), d6), tu::int(2));
    assert_eq!(tu::list_len_of(out), 2);
    assert_eq!(tu::kind_of(tu::list_elem_of(out, 0)), 1, "repeat elems are thunks");
    assert_eq!(op_add_2(tu::list_elem_of(out, 0), tu::int(0)), tu::int(4));
    assert_eq!(op_add_2(tu::list_elem_of(out, 1), tu::int(0)), tu::int(3));
}

#[test]
fn take_on_lists() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    let t = thunk_new(const_body(tu::int(9)), 0);
    let list = list_of(&[tu::int(1), t, tu::int(3)]);

    let out = bf_take_2(list, tu::int(2));
    assert_eq!(tu::list_len_of(out), 2);
    assert_eq!(tu::list_elem_of(out, 1), t, "handles unforced");
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);

    // n ≥ len → the whole list (copy).
    let out = bf_take_2(list, tu::int(10));
    assert_eq!(tu::list_len_of(out), 3);
    // n ≤ 0 → [].
    assert_eq!(tu::list_len_of(bf_take_2(list, tu::int(0))), 0);
    // Arg 1 spec: list | sequence | sequence$sum (mask 0b110100).
    let e = bf_take_2(tu::int(1), tu::int(2));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b110100), (2, 0)]);
}

#[test]
fn drop_on_sequences_is_lazy_and_plain() {
    setup();
    tu::rng_seed(0);
    let src = op_d_2(tu::int(3), tu::int(6));
    let dropped = bf_drop_2(src, tu::int(1));
    assert_eq!(tu::kind_of(dropped), 8);
    // Construction pulls nothing.
    assert_eq!(tu::rng_integer(1, 6), 4, "no RNG consumed");

    // The result is PLAIN even over a $sum source: an integer-position
    // cast turns it into a LIST (type error), not a sum.
    let e = op_add_2(dropped, tu::int(0));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b1), (2, 2)]);

    // n ≤ 0 → the SAME stream value.
    assert_eq!(bf_drop_2(src, tu::int(0)), src);
    assert_eq!(bf_drop_2(src, tu::int(-1)), src);
}

#[test]
fn drop_on_sequences_skips_and_memos() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    // 3#(counting body): drop(1) leaves source positions 1 and 2.
    let body = register_body(|_, _, _, _| {
        CALLS.fetch_add(1, Ordering::SeqCst);
        tu::int(7)
    });
    let src = repeat(tu::int(3), closure_new(body, 0, 0));
    let dropped = bf_drop_2(src, tu::int(1));

    let t1 = bf_take_2(dropped, tu::int(2));
    let t2 = bf_take_2(dropped, tu::int(2));
    assert_eq!(tu::list_len_of(t1), 2);
    assert_eq!(tu::list_len_of(t2), 2);
    // Re-reads are served from the drop stream's own memo: identical
    // handles, and forcing all four still runs each body exactly once.
    assert_eq!(tu::list_elem_of(t1, 0), tu::list_elem_of(t2, 0));
    assert_eq!(tu::list_elem_of(t1, 1), tu::list_elem_of(t2, 1));
    assert_eq!(force(tu::list_elem_of(t1, 0)), tu::int(7));
    assert_eq!(force(tu::list_elem_of(t1, 1)), tu::int(7));
    assert_eq!(force(tu::list_elem_of(t2, 0)), tu::int(7));
    assert_eq!(force(tu::list_elem_of(t2, 1)), tu::int(7));
    assert_eq!(CALLS.load(Ordering::SeqCst), 2);
}

#[test]
fn drop_then_take_on_iterate() {
    setup();
    let inc = closure_new(
        register_body(|_, _, args, _| op_add_2(tu::read_arg_slot(args, 0), tu::int(1))),
        0,
        1,
    );
    let it = bf_iterate_2(tu::int(1), inc);
    let out = bf_take_2(bf_drop_2(it, tu::int(2)), tu::int(2));
    assert_eq!(tu::list_len_of(out), 2);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(3));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(4));
}

#[test]
fn drop_on_lists() {
    setup();
    let list = list_of(&[tu::int(1), tu::int(2), tu::int(3)]);
    let out = bf_drop_2(list, tu::int(1));
    assert_eq!(tu::list_len_of(out), 2);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(2));
    // n ≥ len → [].
    assert_eq!(tu::list_len_of(bf_drop_2(list, tu::int(10))), 0);
    // n ≤ 0 → a full COPY (different object, same handles).
    let out0 = bf_drop_2(list, tu::int(0));
    assert_eq!(tu::list_len_of(out0), 3);
    assert_eq!(tu::list_elem_of(out0, 0), tu::list_elem_of(list, 0));
    assert_ne!(out0, list);
    let outn = bf_drop_2(list, tu::int(-2));
    assert_eq!(tu::list_len_of(outn), 3);
    // Arg spec shared with take.
    let e = bf_drop_2(tu::boolean(true), tu::int(1));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b110100), (2, 1)]);
}

// --- takeWhile / dropWhile -------------------------------------------------------

#[test]
fn take_while_and_drop_while() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    static CALLS2: AtomicUsize = AtomicUsize::new(0);
    // Predicate: x <= 2, counting calls.
    let body = register_body(|_, _, args, _| {
        CALLS.fetch_add(1, Ordering::SeqCst);
        op_le_2(tu::read_arg_slot(args, 0), tu::int(2))
    });
    let f = closure_new(body, 0, 1);
    let erring = thunk_new(error_body(&CALLS2), 0);

    let list = list_of(&[tu::int(1), tu::int(2), tu::int(3), erring]);
    let tw = bf_takeWhile_2(list, f);
    assert_eq!(tu::list_len_of(tw), 2);
    assert_eq!(tu::list_elem_of(tw, 1), tu::int(2));
    // STOP at the first false: elements past it are never touched.
    assert_eq!(CALLS.load(Ordering::SeqCst), 3);
    assert_eq!(tu::thunk_state_of(erring), 0);

    let dw = bf_dropWhile_2(list, f);
    assert_eq!(tu::list_len_of(dw), 2);
    assert_eq!(tu::list_elem_of(dw, 0), tu::int(3), "the false element is kept");
    assert_eq!(tu::list_elem_of(dw, 1), erring, "the rest kept as unforced handles");
    // f ran its own 3-call scan for dropWhile, but never on the rest.
    assert_eq!(CALLS.load(Ordering::SeqCst), 6);
    assert_eq!(CALLS2.load(Ordering::SeqCst), 0);

    // All-true: takeWhile = whole list, dropWhile = [].
    let always = closure_new(const_body(tu::boolean(true)), 0, 1);
    assert_eq!(tu::list_len_of(bf_takeWhile_2(list, always)), 4);
    assert_eq!(tu::list_len_of(bf_dropWhile_2(list, always)), 0);
    assert_eq!(tu::thunk_state_of(erring), 0);
}

#[test]
fn while_family_error_shapes() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    // Non-boolean predicate result → key 48 (pos 2, name, bool, actual).
    let bad = closure_new(const_body(tu::int(1)), 0, 1);
    let e = bf_takeWhile_2(list_of(&[tu::int(1)]), bad);
    assert_eq!(err_key(e), 48);
    let params = err_params(e);
    assert_eq!(params[0], (0, 2));
    assert_eq!(tu::string_param_of(e, 1), "takeWhile/2");
    assert_eq!(params[2], (2, 1)); // expected BOOLEAN
    assert_eq!(params[3], (2, 0)); // actual INTEGER
    let e = bf_dropWhile_2(list_of(&[tu::int(1)]), bad);
    assert_eq!(err_key(e), 48);
    assert_eq!(tu::string_param_of(e, 1), "dropWhile/2");

    // A predicate error aborts the whole call.
    let errf = closure_new(error_body(&CALLS), 0, 1);
    let e = bf_takeWhile_2(list_of(&[tu::int(1), tu::int(2)]), errf);
    assert_eq!(err_key(e), 30);
    let e = bf_dropWhile_2(list_of(&[tu::int(1), tu::int(2)]), errf);
    assert_eq!(err_key(e), 30);
}
