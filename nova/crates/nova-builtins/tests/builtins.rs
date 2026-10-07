//! Builtin tests: arithmetic incl. range checks, div/mod/pow edges and their
//! error keys/params, short-circuit logic, HOFs via the closure mock, laziness
//! of at/head/append, dice, and sequence casts.

mod common;

use std::sync::atomic::{AtomicUsize, Ordering};

use common::*;
use dicexp_nova_builtins::builtins::*;
use dicexp_nova_builtins::runtime::*;
use dicexp_nova_builtins::testutil as tu;

const MAX: i64 = 9007199254740991;
const MIN: i64 = -9007199254740991;

// --- arithmetic -------------------------------------------------------------

#[test]
fn arithmetic_basics() {
    setup();
    assert_eq!(op_add_2(tu::int(1), tu::int(2)), tu::int(3));
    assert_eq!(op_sub_2(tu::int(7), tu::int(10)), tu::int(-3));
    assert_eq!(op_mul_2(tu::int(-6), tu::int(7)), tu::int(-42));
    assert_eq!(op_pos_1(tu::int(5)), tu::int(5));
    assert_eq!(op_neg_1(tu::int(5)), tu::int(-5));
    assert_eq!(op_neg_1(tu::int(MIN)), tu::int(MAX));
}

#[test]
fn arithmetic_range_checks() {
    setup();
    let e = op_add_2(tu::int(MAX), tu::int(1));
    assert_eq!(err_key(e), 1); // LIMITATION_EXCEEDED_MAX_SAFE_INTEGER
    assert_eq!(int_err_params(e), vec![MAX]);

    let e = op_sub_2(tu::int(-MAX), tu::int(1));
    assert_eq!(err_key(e), 2); // LIMITATION_EXCEEDED_MIN_SAFE_INTEGER
    assert_eq!(int_err_params(e), vec![MIN]);

    let e = op_mul_2(tu::int(MAX), tu::int(2));
    assert_eq!(err_key(e), 1);
    let e = op_mul_2(tu::int(MAX), tu::int(-2));
    assert_eq!(err_key(e), 2);
    // Boundaries stay fine.
    assert_eq!(op_add_2(tu::int(MAX), tu::int(0)), tu::int(MAX));
    assert_eq!(op_mul_2(tu::int(MAX), tu::int(1)), tu::int(MAX));
}

#[test]
fn division_semantics_and_errors() {
    setup();
    // i64 truncating division (no 32-bit truncation: compat.md #2).
    assert_eq!(op_div_2(tu::int(7), tu::int(2)), tu::int(3));
    assert_eq!(op_div_2(tu::int(-7), tu::int(2)), tu::int(-3));
    assert_eq!(op_div_2(tu::int(MAX), tu::int(2)), tu::int(MAX / 2));

    let e = op_div_2(tu::int(1), tu::int(0));
    assert_eq!(err_key(e), 30);
    assert_eq!(tu::string_param_of(e, 0), "1 // 0");

    let e = op_div_2(tu::int(-5), tu::int(0));
    assert_eq!(tu::string_param_of(e, 0), "-5 // 0");
}

#[test]
fn modulo_sign_rules_and_errors() {
    setup();
    assert_eq!(op_mod_2(tu::int(7), tu::int(2)), tu::int(1));
    assert_eq!(op_mod_2(tu::int(0), tu::int(5)), tu::int(0));

    // Dividend must be ≥ 0 (left operand parenthesized when negative).
    let e = op_mod_2(tu::int(-3), tu::int(2));
    assert_eq!(err_key(e), 31);
    assert_eq!(tu::string_param_of(e, 0), "(-3) % 2");

    // Divisor must be > 0 (checked only when dividend ≥ 0).
    let e = op_mod_2(tu::int(3), tu::int(0));
    assert_eq!(err_key(e), 32);
    assert_eq!(tu::string_param_of(e, 0), "3 % 0");
    let e = op_mod_2(tu::int(3), tu::int(-2));
    assert_eq!(err_key(e), 32);
    assert_eq!(tu::string_param_of(e, 0), "3 % -2");
    // Negative dividend wins over non-positive divisor.
    let e = op_mod_2(tu::int(-3), tu::int(-2));
    assert_eq!(err_key(e), 31);
    assert_eq!(tu::string_param_of(e, 0), "(-3) % -2");

    // 64-bit semantics (naive truncated to 32 bits).
    assert_eq!(op_mod_2(tu::int(MAX), tu::int(2)), tu::int(1));
}

#[test]
fn power_semantics_and_errors() {
    setup();
    assert_eq!(op_pow_2(tu::int(2), tu::int(10)), tu::int(1024));
    assert_eq!(op_pow_2(tu::int(0), tu::int(0)), tu::int(1));
    assert_eq!(op_pow_2(tu::int(0), tu::int(5)), tu::int(0));
    assert_eq!(op_pow_2(tu::int(-2), tu::int(3)), tu::int(-8));
    assert_eq!(op_pow_2(tu::int(-1), tu::int(MAX)), tu::int(-1)); // odd, no hang
    assert_eq!(op_pow_2(tu::int(-1), tu::int(MAX - 1)), tu::int(1));

    let e = op_pow_2(tu::int(2), tu::int(-1));
    assert_eq!(err_key(e), 33);
    assert_eq!(tu::string_param_of(e, 0), "2 ** -1");
    // naive does NOT parenthesize a negative base here.
    let e = op_pow_2(tu::int(-2), tu::int(-1));
    assert_eq!(tu::string_param_of(e, 0), "-2 ** -1");

    // Overflow → limitation (fast: no huge-n loop).
    let e = op_pow_2(tu::int(2), tu::int(62));
    assert_eq!(err_key(e), 1);
    let e = op_pow_2(tu::int(-2), tu::int(63));
    assert_eq!(err_key(e), 2);
}

// --- equality / comparison ----------------------------------------------------

#[test]
fn equality_and_type_mismatch() {
    setup();
    assert_eq!(op_eq_2(tu::int(1), tu::int(1)), tu::boolean(true));
    assert_eq!(op_ne_2(tu::int(1), tu::int(1)), tu::boolean(false));
    assert_eq!(op_eq_2(tu::boolean(true), tu::boolean(false)), tu::boolean(false));
    assert_eq!(op_ne_2(tu::int(1), tu::int(2)), tu::boolean(true));

    // Different types on the two sides → illegal operation.
    let e = op_eq_2(tu::int(1), tu::boolean(true));
    assert_eq!(err_key(e), 42); // ILLEGAL_OPERATION_LR_TYPE_MISMATCH
    assert_eq!(tu::string_param_of(e, 0), "==");
    let e = op_ne_2(tu::int(1), tu::boolean(true));
    assert_eq!(err_key(e), 42);
    assert_eq!(tu::string_param_of(e, 0), "!=");

    // Lists fail the parameter spec (callArgumentTypeMismatch, 1-based pos).
    let e = op_eq_2(list_of(&[]), tu::int(1));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b11), (2, 2)]);
}

#[test]
fn comparisons() {
    setup();
    assert_eq!(op_lt_2(tu::int(1), tu::int(2)), tu::boolean(true));
    assert_eq!(op_gt_2(tu::int(1), tu::int(2)), tu::boolean(false));
    assert_eq!(op_le_2(tu::int(2), tu::int(2)), tu::boolean(true));
    assert_eq!(op_ge_2(tu::int(2), tu::int(2)), tu::boolean(true));
}

// --- logic (short-circuit) ----------------------------------------------------

#[test]
fn and_or_short_circuit() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);

    // `and`: LHS false ⇒ RHS never forced.
    CALLS.store(0, Ordering::SeqCst);
    let rhs = thunk_new(error_body(&CALLS), 0);
    assert_eq!(op_and_2(tu::boolean(false), rhs), tu::boolean(false));
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::thunk_state_of(rhs), 0, "RHS must stay unevaluated");

    // `or`: LHS true ⇒ RHS never forced.
    let rhs2 = thunk_new(error_body(&CALLS), 0);
    assert_eq!(op_or_2(tu::boolean(true), rhs2), tu::boolean(true));
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);

    // Forced paths.
    let t = thunk_new(const_body(tu::boolean(true)), 0);
    assert_eq!(op_and_2(tu::boolean(true), t), tu::boolean(true));
    let f = thunk_new(const_body(tu::boolean(false)), 0);
    assert_eq!(op_or_2(tu::boolean(false), f), tu::boolean(false));

    // Errors propagate when the RHS is actually forced.
    let rhs3 = thunk_new(error_body(&CALLS), 0);
    assert_eq!(err_key(op_and_2(tu::boolean(true), rhs3)), 30);

    // Lazy RHS still type-checked when forced (position 2, expected boolean).
    let e = op_and_2(tu::boolean(true), tu::int(1));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 2), (3, 0b10), (2, 0)]);
}

#[test]
fn not_basic() {
    setup();
    assert_eq!(op_not_1(tu::boolean(true)), tu::boolean(false));
    assert_eq!(op_not_1(tu::boolean(false)), tu::boolean(true));
    let e = op_not_1(tu::int(1));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b10), (2, 0)]);
}

// --- dice ---------------------------------------------------------------------

#[test]
fn d2_with_zero_n_returns_zero_without_consuming_rng() {
    setup();
    tu::rng_seed(0);
    assert_eq!(op_d_2(tu::int(0), tu::int(6)), tu::int(0));
    // The stream must be untouched: the next d6 roll is the first fixture roll.
    assert_eq!(tu::rng_integer(1, 6), 4);
}

#[test]
fn dice_upper_bound_errors() {
    setup();
    // naive hardcodes the rendered left operand to `1` for `d` (quirk).
    let e = op_d_1(tu::int(0));
    assert_eq!(err_key(e), 34);
    assert_eq!(tu::string_param_of(e, 0), "1 d 0");
    assert_eq!(int_err_params(e)[1..], vec![1, 0]);

    let e = op_d_2(tu::int(5), tu::int(0));
    assert_eq!(err_key(e), 34);
    assert_eq!(tu::string_param_of(e, 0), "1 d 0");

    let e = op_range_1(tu::int(0));
    assert_eq!(err_key(e), 34);
    assert_eq!(tu::string_param_of(e, 0), "~ 0");
}

#[test]
fn dice_streams_draw_lazily_and_sum_with_seed() {
    setup();
    tu::rng_seed(42);
    let s = op_d_2(tu::int(3), tu::int(6));
    assert_eq!(tu::kind_of(s), 8); // SEQUENCE
    // sequence$sum casts to its sum under integer spec; fixture (seed 42):
    // first three d6 rolls are 6, 6, 2 → 14.
    assert_eq!(op_add_2(s, tu::int(0)), tu::int(14));
}

#[test]
fn sequence_sum_is_not_a_list() {
    setup();
    tu::rng_seed(0);
    let e = bf_head_1(op_d_1(tu::int(6)));
    assert_eq!(err_key(e), 21); // expected list, got integer (after cast)
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b100), (2, 0)]);
}

#[test]
fn repeat_sequence_casts_to_list_for_sum() {
    setup();
    tu::rng_seed(0);
    // Body yields `d6` (a sequence$sum); forcing an element draws one die.
    let body = register_body(|_, _, _, _| op_d_1(tu::int(6)));
    let c = closure_new(body, 0, 0);
    let seq = repeat(tu::int(3), c);
    // Fixture (seed 0): first three d6 rolls are 4, 3, 5.
    assert_eq!(bf_sum_1(seq), tu::int(12));
}

// --- list utilities -------------------------------------------------------------

#[test]
fn sum_and_product_empty_and_basic() {
    setup();
    assert_eq!(bf_sum_1(list_of(&[])), tu::int(0)); // compat.md #4
    assert_eq!(bf_product_1(list_of(&[])), tu::int(1));
    assert_eq!(bf_sum_1(list_of(&[tu::int(1), tu::int(2), tu::int(3)])), tu::int(6));
    assert_eq!(bf_product_1(list_of(&[tu::int(2), tu::int(3), tu::int(4)])), tu::int(24));
    // Range check applies to the result.
    assert_eq!(err_key(bf_sum_1(list_of(&[tu::int(MAX), tu::int(1)]))), 1);
}

#[test]
fn sum_and_product_reject_non_integer_items() {
    setup();
    let e = bf_sum_1(list_of(&[tu::boolean(true)]));
    assert_eq!(err_key(e), 45); // LIST_HAS_NON_INTEGER_ITEM
    let e = bf_product_1(list_of(&[list_of(&[])]));
    assert_eq!(err_key(e), 45);
}

#[test]
fn any_flattens_nested_lists() {
    setup();
    assert_eq!(bf_any_1(list_of(&[])), tu::boolean(false));
    assert_eq!(bf_any_1(list_of(&[tu::boolean(false)])), tu::boolean(false));
    // [false, [true, false]] — naive's flatten bug would lose `true`.
    let nested = list_of(&[tu::boolean(false), list_of(&[tu::boolean(true), tu::boolean(false)])]);
    assert_eq!(bf_any_1(nested), tu::boolean(true));
    let e = bf_any_1(list_of(&[tu::int(1)]));
    assert_eq!(err_key(e), 46); // LIST_HAS_NON_BOOLEAN_ITEM
}

#[test]
fn sort_orders_and_errors() {
    setup();
    let sorted = bf_sort_1(list_of(&[tu::int(3), tu::int(1), tu::int(2)]));
    assert_eq!(tu::list_len_of(sorted), 3);
    assert_eq!(tu::list_elem_of(sorted, 0), tu::int(1));
    assert_eq!(tu::list_elem_of(sorted, 1), tu::int(2));
    assert_eq!(tu::list_elem_of(sorted, 2), tu::int(3));

    let sorted = bf_sort_1(list_of(&[tu::boolean(true), tu::boolean(false)]));
    assert_eq!(tu::list_elem_of(sorted, 0), tu::boolean(false));
    assert_eq!(tu::list_elem_of(sorted, 1), tu::boolean(true));

    assert_eq!(tu::list_len_of(bf_sort_1(list_of(&[]))), 0);

    // Mixed element types are not sortable.
    let e = bf_sort_1(list_of(&[tu::int(1), tu::boolean(true)]));
    assert_eq!(err_key(e), 47); // LIST_NOT_SORTABLE
    let e = bf_sort_1(list_of(&[list_of(&[])]));
    assert_eq!(err_key(e), 47);
}

#[test]
fn at_bounds_and_laziness() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    let body = register_body(|_, _, _, _| {
        CALLS.fetch_add(1, Ordering::SeqCst);
        tu::int(20)
    });
    let t = thunk_new(body, 0);
    let list = list_of(&[tu::int(10), t, tu::int(30)]);

    // `at` returns the element handle UNFORCED.
    let got = bf_at_2(list, tu::int(1));
    assert_eq!(got, t);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::thunk_state_of(got), 0);
    assert_eq!(force(got), tu::int(20));
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);

    for idx in [3, -1] {
        let e = bf_at_2(list, tu::int(idx));
        assert_eq!(err_key(e), 43); // AT_INDEX_OUT_OF_BOUNDS
        assert_eq!(int_err_params(e), vec![3, idx]);
    }
}

#[test]
fn head_and_tail() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    let body = register_body(|_, _, _, _| {
        CALLS.fetch_add(1, Ordering::SeqCst);
        tu::int(1)
    });
    let t = thunk_new(body, 0);
    let list = list_of(&[t, tu::int(2), tu::int(3)]);

    // `head` returns the element UNFORCED.
    let h = bf_head_1(list);
    assert_eq!(h, t);
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);

    let tail = bf_tail_1(list);
    assert_eq!(tu::list_len_of(tail), 2);
    assert_eq!(tu::list_elem_of(tail, 0), tu::int(2));

    let empty = list_of(&[]);
    assert_eq!(err_key(bf_head_1(empty)), 44); // EMPTY_LIST
    assert_eq!(err_key(bf_tail_1(empty)), 44);
}

#[test]
fn append_keeps_element_lazy() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    let body = register_body(|_, _, _, _| {
        CALLS.fetch_add(1, Ordering::SeqCst);
        tu::int(99)
    });
    let t = thunk_new(body, 0);
    let out = bf_append_2(list_of(&[tu::int(1)]), t);
    assert_eq!(tu::list_len_of(out), 2);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(1));
    assert_eq!(tu::list_elem_of(out, 1), t, "appended element stays unforced");
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(force(tu::list_elem_of(out, 1)), tu::int(99));
}

// --- HOFs -----------------------------------------------------------------------

#[test]
fn map_applies_closure_and_memoizes_results() {
    setup();
    let body = register_body(|_, _, args, _| {
        let x = tu::read_arg_slot(args, 0);
        op_mul_2(x, tu::int(2))
    });
    let c = closure_new(body, 0, 1);
    let out = bf_map_2(list_of(&[tu::int(1), tu::int(2), tu::int(3)]), c);
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 0), tu::int(2));
    assert_eq!(tu::list_elem_of(out, 1), tu::int(4));
    assert_eq!(tu::list_elem_of(out, 2), tu::int(6));
}

#[test]
fn map_stops_after_first_error() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    // Body: 10 // x — errors for x == 0.
    let body = register_body(|_, _, args, _| {
        CALLS.fetch_add(1, Ordering::SeqCst);
        op_div_2(tu::int(10), tu::read_arg_slot(args, 0))
    });
    let c = closure_new(body, 0, 1);
    let out = bf_map_2(list_of(&[tu::int(1), tu::int(0), tu::int(2)]), c);
    assert_eq!(CALLS.load(Ordering::SeqCst), 2, "third element never evaluated");
    assert_eq!(tu::list_elem_of(out, 0), tu::int(10));
    let e1 = tu::list_elem_of(out, 1);
    assert_eq!(err_key(e1), 30);
    // Trailing slots hold the same error (no leaked "unevaluated").
    assert_eq!(tu::list_elem_of(out, 2), e1);
}

#[test]
fn filter_and_count() {
    setup();
    // Body: keep even numbers (must return a BOOLEAN).
    let body = register_body(|_, _, args, _| {
        let m = op_mod_2(tu::read_arg_slot(args, 0), tu::int(2));
        op_eq_2(m, tu::int(0))
    });
    let c = closure_new(body, 0, 1);
    let list = list_of(&[tu::int(1), tu::int(2), tu::int(3), tu::int(4)]);
    let kept = bf_filter_2(list, c);
    assert_eq!(tu::list_len_of(kept), 2);
    assert_eq!(tu::list_elem_of(kept, 0), tu::int(2));
    assert_eq!(tu::list_elem_of(kept, 1), tu::int(4));
    assert_eq!(bf_count_2(list, c), tu::int(2));

    // Non-boolean closure results are rejected (position 2, name, expected,
    // actual) — with NO implicit cast (naive parity).
    let bad = closure_new(const_body(tu::int(1)), 0, 1);
    let e = bf_filter_2(list_of(&[tu::int(1)]), bad);
    assert_eq!(err_key(e), 48); // CLOSURE_RETURN_TYPE_MISMATCH
    let params = err_params(e);
    assert_eq!(params[0], (0, 2)); // position
    assert_eq!(tu::string_param_of(e, 1), "filter/2");
    assert_eq!(params[2], (2, 1)); // expected boolean
    assert_eq!(params[3], (2, 0)); // actual integer

    let e = bf_count_2(list_of(&[tu::int(1)]), bad);
    assert_eq!(err_key(e), 48);
    assert_eq!(tu::string_param_of(e, 1), "count/2");
}

#[test]
fn zip_and_zip_with() {
    setup();
    let out = bf_zip_2(
        list_of(&[tu::int(1), tu::int(2)]),
        list_of(&[tu::boolean(true)]),
    );
    assert_eq!(tu::list_len_of(out), 1, "zip length is min of the two");
    let pair = tu::list_elem_of(out, 0);
    assert_eq!(tu::list_elem_of(pair, 0), tu::int(1));
    assert_eq!(tu::list_elem_of(pair, 1), tu::boolean(true));

    let body = register_body(|_, _, args, _| {
        op_add_2(tu::read_arg_slot(args, 0), tu::read_arg_slot(args, 1))
    });
    let c = closure_new(body, 0, 2);
    let out = bf_zipWith_3(
        list_of(&[tu::int(1), tu::int(2), tu::int(3)]),
        list_of(&[tu::int(10), tu::int(20), tu::int(30)]),
        c,
    );
    assert_eq!(tu::list_len_of(out), 3);
    assert_eq!(tu::list_elem_of(out, 2), tu::int(33));
}

#[test]
fn range_with_swapped_bounds_draws_via_swap() {
    setup();
    // `~/2` has no upper-bound check; naive's integer() swaps the bounds.
    // Fixture `int 3 2 10`: first draw is 4.
    tu::rng_seed(3);
    let s = op_range_2(tu::int(10), tu::int(2));
    assert_eq!(op_add_2(s, tu::int(0)), tu::int(4));
}

#[test]
fn negative_dice_count_returns_zero_deviation() {
    setup();
    // naive crashes on `new Array(-1)`; nova extends the n = 0 rule.
    tu::rng_seed(0);
    assert_eq!(op_d_2(tu::int(-1), tu::int(6)), tu::int(0));
    assert_eq!(tu::rng_integer(1, 6), 4, "no RNG consumed");
}

#[test]
fn negative_repeat_count_returns_empty_list_deviation() {
    setup();
    let c = closure_new(const_body(tu::int(1)), 0, 0);
    let v = repeat(tu::int(-2), c);
    assert_eq!(tu::kind_of(v), 5); // LIST
    assert_eq!(tu::list_len_of(v), 0);
}

// --- reroll / explode (sequence transformers) ----------------------------------

#[test]
fn reroll_and_explode_arg_errors_keep_precedence() {
    setup();
    tu::rng_seed(0);
    let c = closure_new(const_body(tu::boolean(true)), 0, 1);

    // Eager params are still forced + type-checked first (naive-consistent
    // precedence): arg 1 must unwrap to a sequence (sequence or
    // sequence$sum — mask 0b110000).
    let e = bf_reroll_2(tu::int(1), c);
    assert_eq!(err_key(e), 21); // CALL_ARGUMENT_TYPE_MISMATCH
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b110000), (2, 0)]);
    let e = bf_explode_2(tu::int(1), c);
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b110000), (2, 0)]);
    // A list is not a sequence either.
    let e = bf_reroll_2(list_of(&[]), c);
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b110000), (2, 2)]);

    // Arg 2 must be a callable.
    let e = bf_reroll_2(op_d_1(tu::int(6)), tu::int(1));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 2), (3, 0b1000), (2, 0)]);
    let e = bf_explode_2(op_d_1(tu::int(6)), tu::boolean(true));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 2), (3, 0b1000), (2, 1)]);
}

#[test]
fn reroll_until_six_is_deterministic() {
    setup();
    // `10d6 |> reroll(|$x| $x <= 5)`: only 6s survive, so the sum is 60 for
    // ANY seed — each reroll pulls the dice source PAST its nominal end of
    // 10 (the dice arm keeps drawing, is_last=false beyond).
    for seed in [0, 1, 42, 7] {
        setup();
        tu::rng_seed(seed);
        let pred = closure_new(
            register_body(|_, _, args, _| op_le_2(tu::read_arg_slot(args, 0), tu::int(5))),
            0,
            1,
        );
        let t = bf_reroll_2(op_d_2(tu::int(10), tu::int(6)), pred);
        // $sum flag propagates from the source: the result casts to its sum.
        assert_eq!(op_add_2(t, tu::int(0)), tu::int(60), "seed {seed}");
    }
}

#[test]
fn reroll_on_repeat_source_keeps_nominal_length() {
    setup();
    tu::rng_seed(0);
    // `3#d6 |> reroll(|$x| $x <= 3)`: rerolled items are replaced by later
    // pulls (the repeat arm creates body thunks forever, past its nominal
    // end) — exactly 3 outputs are produced.
    let d6 = closure_new(register_body(|_, _, _, _| op_d_1(tu::int(6))), 0, 0);
    let src = repeat(tu::int(3), d6);
    let pred = closure_new(
        register_body(|_, _, args, _| op_le_2(tu::read_arg_slot(args, 0), tu::int(3))),
        0,
        1,
    );
    let t = bf_reroll_2(src, pred);
    assert_eq!(tu::kind_of(t), 8); // SEQUENCE (plain flag propagates)
    // Plain flag propagates too: casting under an integer spec type-errors
    // (a plain sequence casts to a LIST, which is not an integer).
    let e = op_add_2(t, tu::int(0));
    assert_eq!(err_key(e), 21);
    assert_eq!(err_params(e), vec![(0, 1), (3, 0b1), (2, 2)]);

    // seed 0 fixture: the `#` elements are themselves d6 sums; the
    // predicate's integer comparison casts each to a roll (memoized). Rolls
    // 4, 3, 5, 1, 6 → base 4 kept, 3 rerolled, 5 kept (the source's nominal
    // last), then 1 rerolled (beyond the source's nominal end) and 6 kept
    // as the replacement: the outputs sum to [4, 5, 6].
    assert_eq!(op_add_2(bf_at_2(t, tu::int(0)), tu::int(0)), tu::int(4));
    assert_eq!(op_add_2(bf_at_2(t, tu::int(1)), tu::int(0)), tu::int(5));
    assert_eq!(op_add_2(bf_at_2(t, tu::int(2)), tu::int(0)), tu::int(6));
    // Exactly the nominal 3 outputs.
    let e = bf_at_2(t, tu::int(3));
    assert_eq!(err_key(e), 43); // AT_INDEX_OUT_OF_BOUNDS
    assert_eq!(int_err_params(e), vec![3, 3]);
}

#[test]
fn explode_appends_extras_after_base_outputs() {
    setup();
    tu::rng_seed(42);
    // `3#d6 |> explode(|$x| $x == 6)`: base outputs then the owed
    // explosions strictly AFTER them (draw order 6, 6, 2, 1, 5).
    let d6 = closure_new(register_body(|_, _, _, _| op_d_1(tu::int(6))), 0, 0);
    let src = repeat(tu::int(3), d6);
    let pred = closure_new(
        register_body(|_, _, args, _| op_eq_2(tu::read_arg_slot(args, 0), tu::int(6))),
        0,
        1,
    );
    let t = bf_explode_2(src, pred);
    // Each output element is a d6 sum; the rolls (drawn in stream order)
    // were 6, 6, 2 then the owed explosions 1, 5 — extras strictly AFTER
    // the base outputs.
    assert_eq!(op_add_2(bf_at_2(t, tu::int(0)), tu::int(0)), tu::int(6));
    assert_eq!(op_add_2(bf_at_2(t, tu::int(1)), tu::int(0)), tu::int(6));
    assert_eq!(op_add_2(bf_at_2(t, tu::int(2)), tu::int(0)), tu::int(2));
    assert_eq!(op_add_2(bf_at_2(t, tu::int(3)), tu::int(0)), tu::int(1));
    assert_eq!(op_add_2(bf_at_2(t, tu::int(4)), tu::int(0)), tu::int(5));
    // Exactly 5 outputs (3 base + 2 explosions): the 5th is the last.
    let e = bf_at_2(t, tu::int(5));
    assert_eq!(err_key(e), 43); // AT_INDEX_OUT_OF_BOUNDS
    assert_eq!(int_err_params(e), vec![5, 5]);
}

#[test]
fn explode_reexplodes_and_keeps_sum_flag() {
    setup();
    tu::rng_seed(42);
    // `1d6 |> explode(|$x| $x == 6)`: the 6 explodes, the extra 6 explodes
    // AGAIN, the next extra (2) stops: [6, 6, 2]. The $sum flag propagates
    // from the dice source: the result sums (14), it is not a list.
    let pred = closure_new(
        register_body(|_, _, args, _| op_eq_2(tu::read_arg_slot(args, 0), tu::int(6))),
        0,
        1,
    );
    let t = bf_explode_2(op_d_1(tu::int(6)), pred);
    assert_eq!(op_add_2(t, tu::int(0)), tu::int(14));
}

#[test]
fn chained_transformers_pull_past_last_marked_output() {
    setup();
    tu::rng_seed(42);
    // `3#d6 |> explode(==6) |> reroll(==1)`: the inner stream is
    // [6, 6, 2, 1, 5] (is_last at index 4); the outer rejects the 1 and
    // pulls the inner PAST its last-marked output to replace it.
    let d6 = closure_new(register_body(|_, _, _, _| op_d_1(tu::int(6))), 0, 0);
    let src = repeat(tu::int(3), d6);
    let explode_pred = closure_new(
        register_body(|_, _, args, _| op_eq_2(tu::read_arg_slot(args, 0), tu::int(6))),
        0,
        1,
    );
    let inner = bf_explode_2(src, explode_pred);
    let reroll_pred = closure_new(
        register_body(|_, _, args, _| op_eq_2(tu::read_arg_slot(args, 0), tu::int(1))),
        0,
        1,
    );
    let outer = bf_reroll_2(inner, reroll_pred);
    // seed 42 fixture: rolls 6, 6, 2, 1, 5, 1, 1, 3 (each output element is
    // a d6 sum) → inner outputs sum to [6, 6, 2, 1, 5] (is_last at 4); the
    // outer rejects the 1, keeps the 5 (the inner's last-marked output —
    // base tracking stops there), then rejects two further 1s pulled from
    // BEYOND the inner's last-marked output before accepting the 3 (debt
    // paid → is_last): [6, 6, 2, 5, 3].
    assert_eq!(op_add_2(bf_at_2(outer, tu::int(0)), tu::int(0)), tu::int(6));
    assert_eq!(op_add_2(bf_at_2(outer, tu::int(1)), tu::int(0)), tu::int(6));
    assert_eq!(op_add_2(bf_at_2(outer, tu::int(2)), tu::int(0)), tu::int(2));
    assert_eq!(op_add_2(bf_at_2(outer, tu::int(3)), tu::int(0)), tu::int(5));
    assert_eq!(op_add_2(bf_at_2(outer, tu::int(4)), tu::int(0)), tu::int(3));
    // Exactly 5 outputs (the inner's nominal — 3 base + 2 explosions).
    let e = bf_at_2(outer, tu::int(5));
    assert_eq!(err_key(e), 43);
    assert_eq!(int_err_params(e), vec![5, 5]);
}

#[test]
fn explode_closure_type_mismatch_reports_reroll_quirk() {
    setup();
    tu::rng_seed(0);
    // A non-boolean closure result is a terminal key-48 error — reported
    // as if from reroll/2 FOR BOTH builtins (naive quirk kept; compat.md).
    let d6 = closure_new(register_body(|_, _, _, _| op_d_1(tu::int(6))), 0, 0);
    let src = repeat(tu::int(3), d6);
    let bad = closure_new(const_body(tu::int(1)), 0, 1);
    for t in [bf_reroll_2(src, bad), bf_explode_2(src, bad)] {
        let e = force(bf_at_2(t, tu::int(0)));
        assert_eq!(err_key(e), 48); // CLOSURE_RETURN_TYPE_MISMATCH
        let params = err_params(e);
        assert_eq!(params[0], (0, 2)); // position (1-based)
        assert_eq!(tu::string_param_of(e, 1), "reroll/2"); // the quirk
        assert_eq!(params[2], (2, 1)); // expected boolean
        assert_eq!(params[3], (2, 0)); // actual integer
        // Terminal: the error output IS the last; nothing else is produced.
        let e = bf_at_2(t, tu::int(1));
        assert_eq!(err_key(e), 43);
        assert_eq!(int_err_params(e), vec![1, 1]);
    }
    // The item was passed UNFORCED and the constant body never forced it:
    // no RNG consumed (the next draw is still the first fixture roll).
    assert_eq!(tu::rng_integer(1, 6), 4);
}

#[test]
fn terminal_error_truncates_future_outputs() {
    setup();
    tu::rng_seed(0);
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    // The closure errors on its 2nd call: outputs after the error position
    // are never produced (the 3rd roll is never drawn).
    let body = register_body(|_, _, args, _| {
        let n = CALLS.fetch_add(1, Ordering::SeqCst);
        let item = force(tu::read_arg_slot(args, 0)); // draws the roll
        if n == 1 {
            op_div_2(tu::int(1), tu::int(0))
        } else {
            op_eq_2(item, tu::int(6))
        }
    });
    let d6 = closure_new(register_body(|_, _, _, _| op_d_1(tu::int(6))), 0, 0);
    let t = bf_explode_2(repeat(tu::int(3), d6), closure_new(body, 0, 1));
    // seed 0 rolls: 4, … → output 0 is an element summing to 4; output 1 is
    // the terminal error (marked last).
    assert_eq!(op_add_2(bf_at_2(t, tu::int(0)), tu::int(0)), tu::int(4));
    let e = force(bf_at_2(t, tu::int(1)));
    assert_eq!(err_key(e), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 2, "production stops at the error");
    let e = bf_at_2(t, tu::int(2));
    assert_eq!(err_key(e), 43);
    assert_eq!(int_err_params(e), vec![2, 2]);
    // The 2nd roll was never CAST (the error fired before the comparison):
    // the next rng draw is still the 2nd fixture roll.
    assert_eq!(tu::rng_integer(1, 6), 3);
}

#[test]
fn closure_error_propagates_as_terminal_output() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    let d6 = closure_new(register_body(|_, _, _, _| op_d_1(tu::int(6))), 0, 0);
    let erring = closure_new(error_body(&CALLS), 0, 1);

    // The closure's error handle becomes the FIRST output, marked last.
    let t = bf_explode_2(repeat(tu::int(3), d6), erring);
    let e = force(bf_at_2(t, tu::int(0)));
    assert_eq!(err_key(e), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);
    let e = bf_at_2(t, tu::int(1));
    assert_eq!(err_key(e), 43);
    assert_eq!(int_err_params(e), vec![1, 1]);

    // [DEVIATION] on the $sum side: naive CRASHES (uncaught) when a
    // bad-closure sequence$sum is summed at top level; nova reports the
    // closure error cleanly instead (see compat.md).
    let t2 = bf_reroll_2(op_d_2(tu::int(3), tu::int(6)), erring);
    assert_eq!(err_key(op_add_2(t2, tu::int(0))), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 2);
}

#[test]
fn any_short_circuits_element_forcing() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    // `true` first: the erroring element is never forced.
    let erring = thunk_new(error_body(&CALLS), 0);
    assert_eq!(bf_any_1(list_of(&[tu::boolean(true), erring])), tu::boolean(true));
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(tu::thunk_state_of(erring), 0, "element must stay unevaluated");

    // Nested: the true sits inside a nested list; later siblings unforced.
    let erring2 = thunk_new(error_body(&CALLS), 0);
    let nested =
        list_of(&[list_of(&[tu::boolean(false), tu::boolean(true)]), erring2]);
    assert_eq!(bf_any_1(nested), tu::boolean(true));
    assert_eq!(CALLS.load(Ordering::SeqCst), 0);

    // Short-circuit also skips implicit casts: a dice stream behind the
    // true is never summed (no RNG consumed).
    tu::rng_seed(0);
    let seq = op_d_2(tu::int(3), tu::int(6));
    assert_eq!(
        bf_any_1(list_of(&[tu::boolean(true), seq])),
        tu::boolean(true)
    );
    assert_eq!(tu::rng_integer(1, 6), 4, "no RNG consumed");

    // No true: everything is forced, result false.
    assert_eq!(
        bf_any_1(list_of(&[tu::boolean(false), tu::boolean(false)])),
        tu::boolean(false)
    );
    // Elements actually reached still type-check (no cast of non-booleans).
    let e = bf_any_1(list_of(&[tu::boolean(false), tu::int(1)]));
    assert_eq!(err_key(e), 46); // LIST_HAS_NON_BOOLEAN_ITEM
}

#[test]
fn argument_errors_propagate_indirectly() {
    setup();
    static CALLS: AtomicUsize = AtomicUsize::new(0);
    CALLS.store(0, Ordering::SeqCst);
    let erring = thunk_new(error_body(&CALLS), 0);
    // The exact error handle comes back out of the builtin.
    let e = op_add_2(erring, tu::int(1));
    assert_eq!(err_key(e), 30);
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);

    // Second argument positions too.
    let e = op_add_2(tu::int(1), thunk_new(error_body(&CALLS), 0));
    assert_eq!(err_key(e), 30);
}
