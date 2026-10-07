//! All 61 builtins from the ABI table (36 through v0.4 + the 25 v0.7
//! additions, ids 36–60).
//!
//! Semantics are ported from naive
//! (`packages/naive-evaluator-builtins/src/base/{operators,functions}`),
//! honoring the deliberate divergences in `nova/docs/compat.md`:
//! short-circuiting `and`/`or` (and `any?` element forcing), i64 `//`/`%`,
//! `sum([]) = 0`, `product([]) = 1`.
//!
//! Each builtin receives value handles (usually unevaluated thunks) and
//! forces per its param spec; all return a value or ERROR handle (u64).
//! Integer-returning ops are range-checked to ±(2^53−1) (naive's
//! `checkInteger` → `limitationExceeded`).

use core::cmp::Ordering;

use dicexp_nova_abi as abi;

use crate::errors;
use errors::mask;
use crate::mem;
use crate::runtime::{
    call_with_args, force_impl, unwrap_arg, unwrap_bool, unwrap_callable, unwrap_int,
    unwrap_list,
};
use crate::seq;
use crate::values;
use values::*;

// ---------------------------------------------------------------------------
// operators — arithmetic
// ---------------------------------------------------------------------------

fn int_result(v: i128) -> u64 {
    if v > abi::MAX_SAFE_INTEGER as i128 {
        errors::limitation_max()
    } else if v < abi::MIN_SAFE_INTEGER as i128 {
        errors::limitation_min()
    } else {
        integer_to_value(v as i64)
    }
}

fn bool_result(b: bool) -> u64 {
    boolean_to_value(b)
}

pub(crate) fn op_add_2_impl(a: u64, b: u64) -> u64 {
    bin_int(a, b, |x, y| int_result(x as i128 + y as i128))
}

pub(crate) fn op_sub_2_impl(a: u64, b: u64) -> u64 {
    bin_int(a, b, |x, y| int_result(x as i128 - y as i128))
}

pub(crate) fn op_mul_2_impl(a: u64, b: u64) -> u64 {
    bin_int(a, b, |x, y| int_result(x as i128 * y as i128))
}

pub(crate) fn op_div_2_impl(a: u64, b: u64) -> u64 {
    let x = match unwrap_int(a, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let y = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if y == 0 {
        return errors::illegal_div_by_zero(x, y);
    }
    // i64 truncating division (compat.md #2: no 32-bit truncation).
    // |x|, |y| ≤ 2^53−1 so this can neither overflow nor go out of range.
    int_result((x / y) as i128)
}

pub(crate) fn op_mod_2_impl(a: u64, b: u64) -> u64 {
    let x = match unwrap_int(a, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let y = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    // naive's sign rules: dividend must be ≥ 0, divisor must be > 0.
    if x < 0 {
        return errors::illegal_mod_negative_dividend(x, y);
    }
    if y <= 0 {
        return errors::illegal_mod_non_positive_divisor(x, y);
    }
    int_result((x % y) as i128)
}

pub(crate) fn op_pow_2_impl(a: u64, b: u64) -> u64 {
    let base = match unwrap_int(a, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let n = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if n < 0 {
        return errors::illegal_pow_negative_exponent(base, n);
    }
    // Checked multiplication; abort as soon as the safe range is exceeded
    // (|base| ≥ 2 escapes within 54 iterations, so no huge-n hang).
    match base {
        0 => return int_result(if n == 0 { 1 } else { 0 }),
        1 => return int_result(1),
        -1 => return int_result(if n % 2 == 0 { 1 } else { -1 }),
        _ => {}
    }
    let mut acc: i128 = 1;
    let mut i: i64 = 0;
    while i < n {
        acc *= base as i128;
        if acc > abi::MAX_SAFE_INTEGER as i128 {
            return errors::limitation_max();
        }
        if acc < abi::MIN_SAFE_INTEGER as i128 {
            return errors::limitation_min();
        }
        i += 1;
    }
    int_result(acc)
}

pub(crate) fn op_pos_1_impl(a: u64) -> u64 {
    match unwrap_int(a, 1) {
        Ok(x) => int_result(x as i128),
        Err(e) => e,
    }
}

pub(crate) fn op_neg_1_impl(a: u64) -> u64 {
    match unwrap_int(a, 1) {
        Ok(x) => int_result(-(x as i128)),
        Err(e) => e,
    }
}

fn bin_int(a: u64, b: u64, f: impl FnOnce(i64, i64) -> u64) -> u64 {
    let x = match unwrap_int(a, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let y = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    f(x, y)
}

// ---------------------------------------------------------------------------
// operators — equality / comparison
// ---------------------------------------------------------------------------

pub(crate) fn op_eq_2_impl(a: u64, b: u64) -> u64 {
    eq_impl(a, b, true)
}

pub(crate) fn op_ne_2_impl(a: u64, b: u64) -> u64 {
    eq_impl(a, b, false)
}

fn eq_impl(a: u64, b: u64, is_eq: bool) -> u64 {
    let va = match unwrap_arg(a, mask::INTEGER_OR_BOOLEAN, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let vb = match unwrap_arg(b, mask::INTEGER_OR_BOOLEAN, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if value_tag(va) != value_tag(vb) {
        // naive: 操作 “==” 非法：两侧操作数的类型不相同
        return errors::illegal_lr_type_mismatch(if is_eq { "==" } else { "!=" });
    }
    let same = if value_tag(va) == TAG_INTEGER {
        value_to_integer(va) == value_to_integer(vb)
    } else {
        value_to_boolean(va) == value_to_boolean(vb)
    };
    bool_result(if is_eq { same } else { !same })
}

pub(crate) fn op_lt_2_impl(a: u64, b: u64) -> u64 {
    cmp_op(a, b, "<", |x, y| x < y)
}
pub(crate) fn op_gt_2_impl(a: u64, b: u64) -> u64 {
    cmp_op(a, b, ">", |x, y| x > y)
}
pub(crate) fn op_le_2_impl(a: u64, b: u64) -> u64 {
    cmp_op(a, b, "<=", |x, y| x <= y)
}
pub(crate) fn op_ge_2_impl(a: u64, b: u64) -> u64 {
    cmp_op(a, b, ">=", |x, y| x >= y)
}

/// `<`/`>`/`<=`/`>=` (v0.7): booleans compare like `==` does — operands
/// forced with spec {integer, boolean}; a VALUE-TAG difference is the
/// `==`/`!=` message shape (key 42, bare rendered op); same tags compare
/// (ints numerically, booleans `false < true`).
fn cmp_op(a: u64, b: u64, op: &str, f: impl FnOnce(i64, i64) -> bool) -> u64 {
    let va = match unwrap_arg(a, mask::INTEGER_OR_BOOLEAN, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let vb = match unwrap_arg(b, mask::INTEGER_OR_BOOLEAN, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if value_tag(va) != value_tag(vb) {
        return errors::illegal_lr_type_mismatch(op);
    }
    // Booleans as 0/1 gives `false < true` for all four orderings.
    let (x, y) = if value_tag(va) == TAG_INTEGER {
        (value_to_integer(va), value_to_integer(vb))
    } else {
        (
            value_to_boolean(va) as i64,
            value_to_boolean(vb) as i64,
        )
    };
    bool_result(f(x, y))
}

// ---------------------------------------------------------------------------
// operators — logic (lazy RHS ⇒ short-circuit; compat.md #1)
// ---------------------------------------------------------------------------

pub(crate) fn op_and_2_impl(a: u64, b: u64) -> u64 {
    match unwrap_bool(a, 1) {
        Ok(false) => bool_result(false), // RHS never forced
        Ok(true) => match unwrap_bool(b, 2) {
            Ok(v) => bool_result(v),
            Err(e) => e,
        },
        Err(e) => e,
    }
}

pub(crate) fn op_or_2_impl(a: u64, b: u64) -> u64 {
    match unwrap_bool(a, 1) {
        Ok(true) => bool_result(true), // RHS never forced
        Ok(false) => match unwrap_bool(b, 2) {
            Ok(v) => bool_result(v),
            Err(e) => e,
        },
        Err(e) => e,
    }
}

pub(crate) fn op_not_1_impl(a: u64) -> u64 {
    match unwrap_bool(a, 1) {
        Ok(v) => bool_result(!v),
        Err(e) => e,
    }
}

// ---------------------------------------------------------------------------
// operators — dice (lazy sequence$sum streams; RNG drawn per pull)
// ---------------------------------------------------------------------------

pub(crate) fn op_d_1_impl(a: u64) -> u64 {
    let x = match unwrap_int(a, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if x < 1 {
        // naive hardcodes the rendered left operand to `1` ("1 d 0") — quirk
        // replicated for differential parity.
        return errors::illegal_range_upper_bound_d(x);
    }
    seq::new_dice_sum(1, x, 1)
}

pub(crate) fn op_d_2_impl(a: u64, b: u64) -> u64 {
    let n = match unwrap_int(a, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let x = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if x < 1 {
        return errors::illegal_range_upper_bound_d(x);
    }
    if n <= 0 {
        // n = 0 → integer 0 WITHOUT consuming RNG (naive parity).
        // n < 0 crashes naive (`new Array(-1)`); nova returns 0 ([DEVIATION]).
        return integer_to_value(0);
    }
    seq::new_dice_sum(1, x, n as u64)
}

pub(crate) fn op_range_1_impl(a: u64) -> u64 {
    let upper = match unwrap_int(a, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if upper < 1 {
        return errors::illegal_range_upper_bound_range(upper);
    }
    seq::new_dice_sum(1, upper, 1)
}

pub(crate) fn op_range_2_impl(a: u64, b: u64) -> u64 {
    let lower = match unwrap_int(a, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let upper = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    // No bound check in naive for `~/2`; swapped bounds are handled by the
    // RNG's integer(lower, upper).
    seq::new_dice_sum(lower, upper, 1)
}

// ---------------------------------------------------------------------------
// functions — dice (sequence transformers; the streams live in seq.rs)
// ---------------------------------------------------------------------------

/// `reroll/2` / `explode/2`: both params eager — arg 1 must unwrap to a
/// sequence (existing key-21 type errors fire before anything else), arg 2
/// to a callable. The result is a NEW transformer sequence wrapping the
/// source; its `sequence$sum` flag mirrors the source's, so `10d6 |>
/// reroll(…)` still sums at the top level and `3#d6 |> …` casts to a list.
/// No arity-1 forms. Construction pulls nothing (laziness preserved).
fn transformer_2(a: u64, b: u64, is_explode: bool) -> u64 {
    let src = match unwrap_arg(a, mask::SEQUENCE_ANY, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let is_sum = values::seq_is_sum_ptr(values::value_to_heap_ptr(src));
    seq::new_transformer(is_sum, src, callable, is_explode)
}

pub(crate) fn bf_reroll_2_impl(a: u64, b: u64) -> u64 {
    transformer_2(a, b, false)
}

pub(crate) fn bf_explode_2_impl(a: u64, b: u64) -> u64 {
    transformer_2(a, b, true)
}

// ---------------------------------------------------------------------------
// functions — utility
// ---------------------------------------------------------------------------

/// Shared loop for `count/2` and `filter/2`: call the predicate on each
/// element (unforced), force the result, require boolean.
/// Returns the count of accepted elements and, for filter, the kept handles.
fn filter_loop(
    list: u32,
    callable: u64,
    name: &str,
    keep: bool,
) -> Result<(i64, mem::Stack), u64> {
    let len = values::list_len(list);
    let mut kept = mem::Stack::new();
    let mut count: i64 = 0;
    let mut i = 0;
    while i < len {
        let elem = values::list_elem(list, i);
        let r = force_impl(call_with_args(callable, &[elem]));
        if is_error_handle(r) {
            return Err(r);
        }
        if value_tag(r) != TAG_BOOLEAN {
            // NB: naive does NOT implicitly cast here (raw `typeof` check).
            return Err(errors::closure_return_type_mismatch(
                2,
                name,
                abi::value_type::BOOLEAN,
                value_type_of(r),
            ));
        }
        if value_to_boolean(r) {
            count += 1;
            if keep && kept.push(elem).is_err() {
                return Err(errors::memory_limit());
            }
        }
        i += 1;
    }
    Ok((count, kept))
}

pub(crate) fn bf_count_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    match filter_loop(list, callable, "count/2", false) {
        Ok((count, _)) => int_result(count as i128),
        Err(e) => e,
    }
}

/// `sum`/`product` over a list (naive's `unwrapList`: no flattening).
/// Empty list → identity element (compat.md #4).
fn sum_product_impl(a: u64, is_sum: bool) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let mut acc: i128 = if is_sum { 0 } else { 1 };
    let mut i = 0;
    while i < len {
        let v = force_impl(values::list_elem(list, i));
        if is_error_handle(v) {
            return v;
        }
        // Element-level implicit casts apply (sequence$sum → sum integer).
        let v = match crate::runtime::implicit_cast(v, mask::INTEGER) {
            Ok(v) => v,
            Err(e) => return e,
        };
        if value_tag(v) != TAG_INTEGER {
            return errors::list_has_non_integer_item();
        }
        let x = value_to_integer(v) as i128;
        if is_sum {
            acc += x;
        } else {
            acc = match acc.checked_mul(x) {
                Some(p) => p,
                // The true product is far beyond ±(2^53−1) here; naive's
                // double accumulation would also fail the final range check.
                None => {
                    return if (acc >= 0) == (x >= 0) {
                        errors::limitation_max()
                    } else {
                        errors::limitation_min()
                    };
                }
            };
        }
        i += 1;
    }
    int_result(acc)
}

pub(crate) fn bf_sum_1_impl(a: u64) -> u64 {
    sum_product_impl(a, true)
}

pub(crate) fn bf_product_1_impl(a: u64) -> u64 {
    sum_product_impl(a, false)
}

/// `any?`: naive flattens nested lists (`flattenListAll`). [DEVIATION] nova
/// fixes naive's flatten bug (elements after a nested list overwrite earlier
/// flattened values), so no element is lost. [DEVIATION] element forcing
/// short-circuits at the first `true` — remaining elements are never forced
/// (mirrors the `and`/`or` short-circuit, compat.md #1; naive forced every
/// element). Elements actually reached still type-check as booleans.
pub(crate) fn bf_any_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    // Iterative depth-first flatten (explicit stack: no recursion overflow).
    let mut stack = mem::Stack::new();
    if let Err(e) = push_list_elems_reversed(&mut stack, list) {
        return e;
    }
    while let Some(h) = stack.pop() {
        let v = force_impl(h);
        if is_error_handle(v) {
            return v;
        }
        // Spec is {boolean, list}: sequences cast implicitly first.
        let v = match crate::runtime::implicit_cast(v, mask::BOOLEAN | mask::LIST) {
            Ok(v) => v,
            Err(e) => return e,
        };
        match value_tag(v) {
            TAG_BOOLEAN => {
                if value_to_boolean(v) {
                    // Short-circuit ([DEVIATION], see header): remaining
                    // elements are never forced.
                    return bool_result(true);
                }
            }
            TAG_HEAP if heap_kind(v) == Some(abi::kind::LIST) => {
                if let Err(e) = push_list_elems_reversed(&mut stack, value_to_heap_ptr(v)) {
                    return e;
                }
            }
            _ => return errors::list_has_non_boolean_item(),
        }
    }
    bool_result(false)
}

fn push_list_elems_reversed(stack: &mut mem::Stack, list: u32) -> Result<(), u64> {
    let len = values::list_len(list);
    let mut i = len;
    while i > 0 {
        i -= 1;
        if stack.push(values::list_elem(list, i)).is_err() {
            return Err(errors::memory_limit());
        }
    }
    Ok(())
}

/// `sort`: elements must be all-integer or all-boolean (naive's
/// `unwrapListOneOf`); the result is a new list of direct values.
pub(crate) fn bf_sort_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let out = match values::list_new_fallible(len) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    if len == 0 {
        return heap_ptr_to_value(out);
    }
    // Force + type-check all elements (order preserved for error parity).
    let mut int_mode: Option<bool> = None; // Some(true)=ints, Some(false)=bools
    let mut i = 0;
    while i < len {
        let v = force_impl(values::list_elem(list, i));
        if is_error_handle(v) {
            return v;
        }
        let v = match crate::runtime::implicit_cast(v, mask::INTEGER_OR_BOOLEAN) {
            Ok(v) => v,
            Err(e) => return e,
        };
        let is_int = match value_tag(v) {
            TAG_INTEGER => true,
            TAG_BOOLEAN => false,
            _ => return errors::list_not_sortable(),
        };
        match int_mode {
            None => int_mode = Some(is_int),
            Some(m) if m == is_int => {}
            Some(_) => return errors::list_not_sortable(),
        }
        values::list_set(out, i, v);
        i += 1;
    }
    // Sort the element region in place (allocation-free).
    let base = mem::ptr(out);
    let elems = unsafe {
        core::slice::from_raw_parts_mut(base.add(8).cast::<u64>(), len as usize)
    };
    match int_mode {
        Some(true) => elems.sort_unstable_by_key(|&h| value_to_integer(h)),
        _ => elems.sort_unstable(), // booleans: false < true (tag order works)
    }
    heap_ptr_to_value(out)
}

pub(crate) fn bf_append_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    // `el` is $lazy: appended UNFORCED (naive parity).
    let len = values::list_len(list);
    let new_len = match len.checked_add(1) {
        Some(n) => n,
        None => return errors::memory_limit(),
    };
    let out = match values::list_new_fallible(new_len) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < len {
        values::list_set(out, i, values::list_elem(list, i));
        i += 1;
    }
    values::list_set(out, len, b);
    heap_ptr_to_value(out)
}

pub(crate) fn bf_at_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let index = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let len = values::list_len(list) as i64;
    if index < 0 || index >= len {
        return errors::at_index_out_of_bounds(len, index);
    }
    // Element handle returned UNFORCED; the force trampoline collapses it.
    values::list_elem(list, index as u32)
}

// ---------------------------------------------------------------------------
// functions — functional
// ---------------------------------------------------------------------------

pub(crate) fn bf_map_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let out = match values::list_new_fallible(len) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < len {
        // naive forces each closure body eagerly (memoizing), and stops
        // calling once a result confirms error (remaining RNG untouched).
        let r = force_impl(call_with_args(callable, &[values::list_elem(list, i)]));
        values::list_set(out, i, r);
        if is_error_handle(r) {
            // naive leaves leaky "unevaluated" boxes here; nova stores the
            // same error handle instead ([DEVIATION], fixes the leak while
            // preserving naive's evaluation/RNG order).
            let mut j = i + 1;
            while j < len {
                values::list_set(out, j, r);
                j += 1;
            }
            break;
        }
        i += 1;
    }
    heap_ptr_to_value(out)
}

pub(crate) fn bf_filter_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let (_, kept) = match filter_loop(list, callable, "filter/2", true) {
        Ok(r) => r,
        Err(e) => return e,
    };
    let out = match values::list_new_fallible(kept.len()) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < kept.len() {
        values::list_set(out, i, kept.get(i));
        i += 1;
    }
    heap_ptr_to_value(out)
}

pub(crate) fn bf_head_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    if values::list_len(list) == 0 {
        return errors::empty_list();
    }
    // Element handle returned UNFORCED (naive's ["lazy", list[0]]).
    values::list_elem(list, 0)
}

pub(crate) fn bf_tail_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    if len == 0 {
        return errors::empty_list();
    }
    let out = match values::list_new_fallible(len - 1) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 1;
    while i < len {
        values::list_set(out, i - 1, values::list_elem(list, i));
        i += 1;
    }
    heap_ptr_to_value(out)
}

pub(crate) fn bf_zip_2_impl(a: u64, b: u64) -> u64 {
    let l1 = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let l2 = match unwrap_list(b, 2) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let n = values::list_len(l1).min(values::list_len(l2));
    let out = match values::list_new_fallible(n) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < n {
        let pair = match values::list_new_fallible(2) {
            Some(p) => p,
            None => return errors::memory_limit(),
        };
        values::list_set(pair, 0, values::list_elem(l1, i));
        values::list_set(pair, 1, values::list_elem(l2, i));
        values::list_set(out, i, heap_ptr_to_value(pair));
        i += 1;
    }
    heap_ptr_to_value(out)
}

#[allow(non_snake_case)]
pub(crate) fn bf_zipWith_3_impl(a: u64, b: u64, c: u64) -> u64 {
    let l1 = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let l2 = match unwrap_list(b, 2) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(c, 3) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let n = values::list_len(l1).min(values::list_len(l2));
    let out = match values::list_new_fallible(n) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < n {
        let r = force_impl(call_with_args(
            callable,
            &[values::list_elem(l1, i), values::list_elem(l2, i)],
        ));
        values::list_set(out, i, r);
        if is_error_handle(r) {
            // Same early-stop + fill behavior as map (see bf_map_2_impl).
            let mut j = i + 1;
            while j < n {
                values::list_set(out, j, r);
                j += 1;
            }
            break;
        }
        i += 1;
    }
    heap_ptr_to_value(out)
}

// ---------------------------------------------------------------------------
// v0.7 builtins (contracts: nova/docs/v0.7-contracts.md)
// ---------------------------------------------------------------------------

pub(crate) fn bf_abs_1_impl(a: u64) -> u64 {
    match unwrap_int(a, 1) {
        // Inputs are already within ±(2^53−1); the i128 intermediate keeps
        // the range check total regardless.
        Ok(x) => int_result((x as i128).abs()),
        Err(e) => e,
    }
}

/// `count/1`: the length WITHOUT forcing elements (`count([1//0, 2])` = 2).
pub(crate) fn bf_count_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    int_result(values::list_len(list) as i128)
}

/// `has?/2`: scan left-to-right forcing elements (with implicit casts); a
/// non-integer/non-boolean element is key 50, a scalar of the other scalar
/// type is simply UNEQUAL (no error, unlike `==`), and the scan
/// short-circuits at the first match (later elements never forced).
pub(crate) fn bf_has_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let x = match unwrap_arg(b, mask::INTEGER_OR_BOOLEAN, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let mut i = 0;
    while i < len {
        let v = force_impl(values::list_elem(list, i));
        if is_error_handle(v) {
            return v;
        }
        // Element-level implicit casts apply (sequence$sum → sum).
        let v = match crate::runtime::implicit_cast(v, mask::INTEGER_OR_BOOLEAN) {
            Ok(v) => v,
            Err(e) => return e,
        };
        let hit = match value_tag(v) {
            t if t == value_tag(x) => {
                if t == TAG_INTEGER {
                    value_to_integer(v) == value_to_integer(x)
                } else {
                    value_to_boolean(v) == value_to_boolean(x)
                }
            }
            // Cross-type scalar: unequal, no error.
            TAG_INTEGER | TAG_BOOLEAN => false,
            _ => return errors::list_has_non_scalar_item(),
        };
        if hit {
            return bool_result(true);
        }
        i += 1;
    }
    bool_result(false)
}

/// `min`/`max`: integer aggregation like `sum` (element-level implicit
/// casts; empty → key 44, non-integer item → key 45).
fn min_max_impl(a: u64, is_max: bool) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    if len == 0 {
        return errors::empty_list();
    }
    let mut best: i64 = 0;
    let mut i = 0;
    while i < len {
        let v = force_impl(values::list_elem(list, i));
        if is_error_handle(v) {
            return v;
        }
        let v = match crate::runtime::implicit_cast(v, mask::INTEGER) {
            Ok(v) => v,
            Err(e) => return e,
        };
        if value_tag(v) != TAG_INTEGER {
            return errors::list_has_non_integer_item();
        }
        let x = value_to_integer(v);
        if i == 0 || (if is_max { x > best } else { x < best }) {
            best = x;
        }
        i += 1;
    }
    int_result(best as i128)
}

pub(crate) fn bf_min_1_impl(a: u64) -> u64 {
    min_max_impl(a, false)
}

pub(crate) fn bf_max_1_impl(a: u64) -> u64 {
    min_max_impl(a, true)
}

/// `all?`: flatten-DFS like `any?`, but short-circuiting at the first
/// `false` — remaining elements are never forced (compat.md #1's div1
/// split; naive's `all?` flattens eagerly).
pub(crate) fn bf_all_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let mut stack = mem::Stack::new();
    if let Err(e) = push_list_elems_reversed(&mut stack, list) {
        return e;
    }
    while let Some(h) = stack.pop() {
        let v = force_impl(h);
        if is_error_handle(v) {
            return v;
        }
        // Spec is {boolean, list}: sequences cast implicitly first.
        let v = match crate::runtime::implicit_cast(v, mask::BOOLEAN | mask::LIST) {
            Ok(v) => v,
            Err(e) => return e,
        };
        match value_tag(v) {
            TAG_BOOLEAN => {
                if !value_to_boolean(v) {
                    // Short-circuit: remaining elements are never forced.
                    return bool_result(false);
                }
            }
            TAG_HEAP if heap_kind(v) == Some(abi::kind::LIST) => {
                if let Err(e) = push_list_elems_reversed(&mut stack, value_to_heap_ptr(v)) {
                    return e;
                }
            }
            _ => return errors::list_has_non_boolean_item(),
        }
    }
    bool_result(true)
}

/// One `sort/2` comparator call: `f(x, y)` forced, `true` = "x comes no
/// later than y" (Elixir-style `<=`). The FIRST error (closure error or
/// key-48 mismatch) is stashed in `err` and `Equal` is reported afterwards
/// — the sort must run to completion; the caller discards the result.
fn sort_cmp(callable: u64, x: u64, y: u64, err: &mut u64) -> Ordering {
    if *err != 0 {
        return Ordering::Equal;
    }
    let r = force_impl(call_with_args(callable, &[x, y]));
    if is_error_handle(r) {
        *err = r;
        return Ordering::Equal;
    }
    // Raw tag check, like `filter`/`count` (no implicit cast).
    if value_tag(r) != TAG_BOOLEAN {
        *err = errors::closure_return_type_mismatch(
            2,
            "sort/2",
            abi::value_type::BOOLEAN,
            value_type_of(r),
        );
        return Ordering::Equal;
    }
    if value_to_boolean(r) {
        Ordering::Less
    } else {
        Ordering::Greater
    }
}

/// Stable bottom-up merge sort over two emulated buffers (`a` holds the
/// data, `b` is scratch). The comparator allocates (closure calls), so no
/// raw slice may be held across it — all element access goes through
/// `list_elem`/`list_set`, which are offset-addressed and survive native
/// test-memory reallocation. Left run wins ties (stability).
fn merge_sort_stable(a: u32, b: u32, n: u32, callable: u64, err: &mut u64) {
    let n64 = n as u64;
    let mut width: u64 = 1;
    let (mut from, mut into) = (a, b);
    while width < n64 {
        let mut i: u64 = 0;
        while i < n64 {
            let mut l = i;
            let mut r = (i + width).min(n64);
            let lend = r;
            let rend = (r + width).min(n64);
            let mut k = i;
            while l < lend && r < rend {
                let x = values::list_elem(from, l as u32);
                let y = values::list_elem(from, r as u32);
                if sort_cmp(callable, x, y, err) == Ordering::Greater {
                    values::list_set(into, k as u32, y);
                    r += 1;
                } else {
                    values::list_set(into, k as u32, x);
                    l += 1;
                }
                k += 1;
            }
            while l < lend {
                values::list_set(into, k as u32, values::list_elem(from, l as u32));
                l += 1;
                k += 1;
            }
            while r < rend {
                values::list_set(into, k as u32, values::list_elem(from, r as u32));
                r += 1;
                k += 1;
            }
            i = rend;
        }
        core::mem::swap(&mut from, &mut into);
        width = width.saturating_mul(2);
    }
    // The ping-pong may have left the data in the scratch buffer.
    if from != a {
        let mut i: u64 = 0;
        while i < n64 {
            values::list_set(a, i as u32, values::list_elem(from, i as u32));
            i += 1;
        }
    }
}

/// `sort/2`: stable sort by comparator `f(x, y) -> boolean`. Elements are
/// passed to f UNFORCED (like `map`); f's result is forced per comparison.
/// The output list holds the same handles, reordered. A comparator error
/// or key-48 mismatch aborts the sort with that error.
pub(crate) fn bf_sort_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let out = match values::list_new_fallible(len) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < len {
        values::list_set(out, i, values::list_elem(list, i));
        i += 1;
    }
    if len > 1 {
        let scratch = match values::list_new_fallible(len) {
            Some(p) => p,
            None => return errors::memory_limit(),
        };
        let mut err: u64 = 0;
        merge_sort_stable(out, scratch, len, callable, &mut err);
        if err != 0 {
            return err;
        }
    }
    heap_ptr_to_value(out)
}

/// `reverse/1`: new list with the handles reversed (elements stay lazy).
pub(crate) fn bf_reverse_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let out = match values::list_new_fallible(len) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < len {
        values::list_set(out, i, values::list_elem(list, len - 1 - i));
        i += 1;
    }
    heap_ptr_to_value(out)
}

/// `concat/2`: handle-level concatenation (elements stay lazy).
pub(crate) fn bf_concat_2_impl(a: u64, b: u64) -> u64 {
    let l1 = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let l2 = match unwrap_list(b, 2) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let n1 = values::list_len(l1);
    let n2 = values::list_len(l2);
    let new_len = match n1.checked_add(n2) {
        Some(n) => n,
        None => return errors::memory_limit(),
    };
    let out = match values::list_new_fallible(new_len) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < n1 {
        values::list_set(out, i, values::list_elem(l1, i));
        i += 1;
    }
    let mut j = 0;
    while j < n2 {
        values::list_set(out, n1 + j, values::list_elem(l2, j));
        j += 1;
    }
    heap_ptr_to_value(out)
}

/// `prepend/2`: mirrors `append/2` — `el` is $lazy, prepended UNFORCED.
pub(crate) fn bf_prepend_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let new_len = match len.checked_add(1) {
        Some(n) => n,
        None => return errors::memory_limit(),
    };
    let out = match values::list_new_fallible(new_len) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    values::list_set(out, 0, b);
    let mut i = 0;
    while i < len {
        values::list_set(out, i + 1, values::list_elem(list, i));
        i += 1;
    }
    heap_ptr_to_value(out)
}

/// `at/3`: like `at/2`, but out-of-bounds returns the DEFAULT handle
/// UNFORCED instead of erroring (never errors on OOB).
pub(crate) fn bf_at_3_impl(a: u64, b: u64, c: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let index = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let len = values::list_len(list) as i64;
    if index < 0 || index >= len {
        return c;
    }
    values::list_elem(list, index as u32)
}

/// `duplicate/2`: pins its value (regular-function semantics) — the SAME
/// handle is repeated, so `duplicate(d6, 3)` rolls once (`#` remains the
/// re-evaluating construct). `count ≤ 0` → `[]`.
pub(crate) fn bf_duplicate_2_impl(a: u64, b: u64) -> u64 {
    let n = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if n <= 0 {
        return match values::list_new_fallible(0) {
            Some(p) => heap_ptr_to_value(p),
            None => errors::memory_limit(),
        };
    }
    // The memory limit fires long before a list this large could exist;
    // guard the u32 cast anyway (total, no silent wraparound).
    if n > u32::MAX as i64 {
        return errors::memory_limit();
    }
    let out = match values::list_new_fallible(n as u32) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i: u32 = 0;
    while i < n as u32 {
        values::list_set(out, i, a);
        i += 1;
    }
    heap_ptr_to_value(out)
}

/// Shared iterative flatten DFS (explicit stack: no native recursion).
/// Stack frames alternate (remaining_depth, handle). Above the boundary an
/// element is forced (with implicit casts) to test listness: lists splice
/// their handles with depth−1; non-lists keep their ORIGINAL handle (the
/// force already memoized it — no double evaluation). At/below the
/// boundary elements stay unforced. `flattenAll` passes `i64::MAX`.
fn flatten_impl(list: u32, depth: i64) -> Result<u64, u64> {
    let mut stack = mem::Stack::new();
    let mut out = mem::Stack::new();
    if let Err(e) = push_flatten_frames(&mut stack, list, depth) {
        return Err(e);
    }
    while let Some(d) = stack.pop() {
        let h = match stack.pop() {
            Some(h) => h,
            None => return Err(errors::memory_limit()), // unreachable
        };
        let depth = d as i64;
        if depth <= 0 {
            // At the boundary: keep the handle unforced.
            if out.push(h).is_err() {
                return Err(errors::memory_limit());
            }
            continue;
        }
        let v = force_impl(h);
        if is_error_handle(v) {
            return Err(v);
        }
        let v = match crate::runtime::implicit_cast(v, mask::LIST) {
            Ok(v) => v,
            Err(e) => return Err(e),
        };
        if heap_kind(v) == Some(abi::kind::LIST) {
            if let Err(e) = push_flatten_frames(&mut stack, value_to_heap_ptr(v), depth - 1) {
                return Err(e);
            }
        } else if out.push(h).is_err() {
            return Err(errors::memory_limit());
        }
    }
    let len = out.len();
    let list_out = match values::list_new_fallible(len) {
        Some(p) => p,
        None => return Err(errors::memory_limit()),
    };
    let mut i = 0;
    while i < len {
        values::list_set(list_out, i, out.get(i));
        i += 1;
    }
    Ok(values::heap_ptr_to_value(list_out))
}

/// Push the elements of `list` for the flatten DFS with their remaining
/// depth, in reverse so they are visited left-to-right. Frame encoding:
/// handle first, depth second (the depth pops first).
fn push_flatten_frames(stack: &mut mem::Stack, list: u32, depth: i64) -> Result<(), u64> {
    let len = values::list_len(list);
    let mut i = len;
    while i > 0 {
        i -= 1;
        if stack.push(values::list_elem(list, i)).is_err() {
            return Err(errors::memory_limit());
        }
        if stack.push(depth as u64).is_err() {
            return Err(errors::memory_limit());
        }
    }
    Ok(())
}

/// `flatten/2`: `depth ≤ 0` → shallow handle copy; otherwise each element
/// reachable above the boundary is forced (implicit casts) to test
/// listness (`flatten([d6], 1)` draws; `flatten([[d6]], 1)` does not).
pub(crate) fn bf_flatten_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let depth = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if depth <= 0 {
        let len = values::list_len(list);
        let out = match values::list_new_fallible(len) {
            Some(p) => p,
            None => return errors::memory_limit(),
        };
        let mut i = 0;
        while i < len {
            values::list_set(out, i, values::list_elem(list, i));
            i += 1;
        }
        return heap_ptr_to_value(out);
    }
    match flatten_impl(list, depth) {
        Ok(v) => v,
        Err(e) => e,
    }
}

/// `flattenAll/1`: flatten with unbounded depth (every element is
/// eventually forced).
#[allow(non_snake_case)]
pub(crate) fn bf_flattenAll_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    match flatten_impl(list, i64::MAX) {
        Ok(v) => v,
        Err(e) => e,
    }
}

/// `flatMap/2`: like `map` then a depth-1 flatten — per element, call f
/// (element unforced), force the result (error → the whole call errors),
/// implicit-cast it to a LIST (else key 48, pos 2, `flatMap/2`), and append
/// the inner list's element HANDLES unforced.
#[allow(non_snake_case)]
pub(crate) fn bf_flatMap_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let mut out = mem::Stack::new();
    let mut i = 0;
    while i < len {
        let r = force_impl(call_with_args(callable, &[values::list_elem(list, i)]));
        if is_error_handle(r) {
            return r;
        }
        let r = match crate::runtime::implicit_cast(r, mask::LIST) {
            Ok(v) => v,
            Err(e) => return e,
        };
        if heap_kind(r) != Some(abi::kind::LIST) {
            return errors::closure_return_type_mismatch(
                2,
                "flatMap/2",
                abi::value_type::LIST,
                value_type_of(r),
            );
        }
        let inner = value_to_heap_ptr(r);
        let n = values::list_len(inner);
        let mut j = 0;
        while j < n {
            if out.push(values::list_elem(inner, j)).is_err() {
                return errors::memory_limit();
            }
            j += 1;
        }
        i += 1;
    }
    let out_len = out.len();
    let out_list = match values::list_new_fallible(out_len) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut k = 0;
    while k < out_len {
        values::list_set(out_list, k, out.get(k));
        k += 1;
    }
    heap_ptr_to_value(out_list)
}

/// `foldl/3`: strict accumulator — every step's result is forced (bounded
/// thunk chains, compat.md #6). Elements are passed unforced; an error
/// stops the fold and IS the result. Empty list → the init handle as-is.
pub(crate) fn bf_foldl_3_impl(a: u64, b: u64, c: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    // b is the $lazy init handle — never unwrapped here.
    let callable = match unwrap_callable(c, 3) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let mut acc = b;
    let mut i = 0;
    while i < len {
        let r = force_impl(call_with_args(callable, &[acc, values::list_elem(list, i)]));
        if is_error_handle(r) {
            return r;
        }
        acc = r;
        i += 1;
    }
    acc
}

/// `foldr/3`: deferred (naive parity) — the closure is NOT called here.
/// Walking right-to-left, `acc` is wrapped in a `SENTINEL_FOLDR_FNIDX`
/// thunk whose ENV holds `[callable, elem, acc]`; the force trampoline
/// evaluates `f(elem, acc)` when (and only when) the chain is forced.
/// Bodies returning `$acc` unforced are chased iteratively by the root
/// force (bounded stack); bodies forcing acc nested inside value calls
/// overflow like naive (compat.md #6 — suites keep chains shallow).
pub(crate) fn bf_foldr_3_impl(a: u64, b: u64, c: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(c, 3) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let mut acc = b; // the init handle, unforced
    let mut i = len;
    while i > 0 {
        i -= 1;
        let env = values::env_new(0, 3);
        values::env_set_slot(env, 0, callable);
        values::env_set_slot(env, 1, values::list_elem(list, i));
        values::env_set_slot(env, 2, acc);
        let t = values::thunk_new(values::SENTINEL_FOLDR_FNIDX, env);
        if is_error_handle(t) {
            return t; // thunk_new only fails on OOM
        }
        acc = t;
    }
    // The final thunk handle, unforced (or the init handle when empty).
    acc
}

/// `iterate/2`: the start handle stays lazy (forced at the first pull);
/// construction pulls nothing. The stream itself lives in `seq`.
pub(crate) fn bf_iterate_2_impl(a: u64, b: u64) -> u64 {
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    seq::new_iterate(a, callable)
}

/// `unfold/2`: the seed handle stays lazy (forced per pull, before f).
pub(crate) fn bf_unfold_2_impl(a: u64, b: u64) -> u64 {
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    seq::new_unfold(a, callable)
}

/// `last/1`: empty → key 44; else the final element handle UNFORCED.
pub(crate) fn bf_last_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    if len == 0 {
        return errors::empty_list();
    }
    values::list_elem(list, len - 1)
}

/// `init/1`: everything but the last element (handles, lazy); empty → 44.
pub(crate) fn bf_init_1_impl(a: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    if len == 0 {
        return errors::empty_list();
    }
    let out = match values::list_new_fallible(len - 1) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < len - 1 {
        values::list_set(out, i, values::list_elem(list, i));
        i += 1;
    }
    heap_ptr_to_value(out)
}

/// `take/2` (list-or-sequence → LIST). Lists: the first min(n, len)
/// handles. Sequences: pulls n ACTUAL positions (past the nominal end for
/// infinite sources — `take(d6, 3)` is 3 rolls) or until the stream ends,
/// collecting handles unforced. `n ≤ 0` → `[]` (nothing pulled, no RNG).
pub(crate) fn bf_take_2_impl(a: u64, b: u64) -> u64 {
    let v = match unwrap_arg(a, mask::LIST_OR_SEQUENCE_ANY, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let n = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if heap_kind(v) == Some(abi::kind::SEQUENCE) {
        let p = value_to_heap_ptr(v);
        let mut collected = mem::Stack::new();
        if n > 0 {
            let mut i: u64 = 0;
            while i < n as u64 {
                match seq::pull(p, i) {
                    Ok(seq::Pull::Item(h, _)) => {
                        // is_last is deliberately ignored: take pulls n
                        // ACTUAL positions (infinite sources keep going
                        // past their nominal end).
                        if collected.push(h).is_err() {
                            return errors::memory_limit();
                        }
                    }
                    Ok(seq::Pull::Ended) => break,
                    Err(e) => return e,
                }
                i += 1;
            }
        }
        let len = collected.len();
        let out = match values::list_new_fallible(len) {
            Some(p) => p,
            None => return errors::memory_limit(),
        };
        let mut j = 0;
        while j < len {
            values::list_set(out, j, collected.get(j));
            j += 1;
        }
        return heap_ptr_to_value(out);
    }
    // List: first min(n, len) handles, unforced.
    let list = value_to_heap_ptr(v);
    let len = values::list_len(list) as i64;
    let take = if n < 0 { 0 } else if n > len { len } else { n };
    let out = match values::list_new_fallible(take as u32) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i: i64 = 0;
    while i < take {
        values::list_set(out, i as u32, values::list_elem(list, i as u32));
        i += 1;
    }
    heap_ptr_to_value(out)
}

/// Shared scan for `takeWhile`/`dropWhile`: the index of the first element
/// whose predicate is `false` (or `len` if none). Elements past the stop
/// are never touched; predicate results are force-checked as raw booleans
/// (like `filter`); predicate errors abort.
fn while_stop(list: u32, callable: u64, name: &str) -> Result<u32, u64> {
    let len = values::list_len(list);
    let mut i = 0;
    while i < len {
        let r = force_impl(call_with_args(callable, &[values::list_elem(list, i)]));
        if is_error_handle(r) {
            return Err(r);
        }
        if value_tag(r) != TAG_BOOLEAN {
            return Err(errors::closure_return_type_mismatch(
                2,
                name,
                abi::value_type::BOOLEAN,
                value_type_of(r),
            ));
        }
        if !value_to_boolean(r) {
            return Ok(i);
        }
        i += 1;
    }
    Ok(len)
}

/// `takeWhile/2`: handles while the predicate holds; STOP at the first
/// `false` or error (elements past the stop are never touched).
#[allow(non_snake_case)]
pub(crate) fn bf_takeWhile_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let stop = match while_stop(list, callable, "takeWhile/2") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let out = match values::list_new_fallible(stop) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = 0;
    while i < stop {
        values::list_set(out, i, values::list_elem(list, i));
        i += 1;
    }
    heap_ptr_to_value(out)
}

/// `drop/2` (list-or-sequence). Lists: handles from index min(n, len).
/// Sequences: a NEW plain sequence skipping `n` pulls lazily (nothing
/// pulled at construction; RNG only when the result is pulled; the
/// source's `$sum`-ness is dropped). `n ≤ 0` → the input (list: copy;
/// sequence: the same stream value).
pub(crate) fn bf_drop_2_impl(a: u64, b: u64) -> u64 {
    let v = match unwrap_arg(a, mask::LIST_OR_SEQUENCE_ANY, 1) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let n = match unwrap_int(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    if heap_kind(v) == Some(abi::kind::SEQUENCE) {
        if n <= 0 {
            return v;
        }
        return seq::new_drop(v, n as u64);
    }
    let list = value_to_heap_ptr(v);
    let len = values::list_len(list) as i64;
    let start = if n < 0 { 0 } else if n > len { len } else { n };
    let keep = (len - start) as u32;
    let out = match values::list_new_fallible(keep) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = start;
    while i < len {
        values::list_set(out, (i - start) as u32, values::list_elem(list, i as u32));
        i += 1;
    }
    heap_ptr_to_value(out)
}

/// `dropWhile/2`: skip while the predicate holds; from the first `false`,
/// keep the REST as unforced handles (f is never called on them).
#[allow(non_snake_case)]
pub(crate) fn bf_dropWhile_2_impl(a: u64, b: u64) -> u64 {
    let list = match unwrap_list(a, 1) {
        Ok(p) => p,
        Err(e) => return e,
    };
    let callable = match unwrap_callable(b, 2) {
        Ok(v) => v,
        Err(e) => return e,
    };
    let stop = match while_stop(list, callable, "dropWhile/2") {
        Ok(s) => s,
        Err(e) => return e,
    };
    let len = values::list_len(list);
    let keep = len - stop;
    let out = match values::list_new_fallible(keep) {
        Some(p) => p,
        None => return errors::memory_limit(),
    };
    let mut i = stop;
    while i < len {
        values::list_set(out, i - stop, values::list_elem(list, i));
        i += 1;
    }
    heap_ptr_to_value(out)
}

// ---------------------------------------------------------------------------
// capture dispatch (call_callable → builtin by id)
// ---------------------------------------------------------------------------

/// Dispatch a captured builtin by ABI id, reading args from `args_ptr`.
/// `None` for unknown ids (defensive; the compiler never emits them).
pub(crate) fn dispatch_by_id(id: u32, args_ptr: u32) -> Option<u64> {
    let a = |i: u32| mem::read_u64(args_ptr, (i as usize) * 8);
    Some(match id {
        0 => op_add_2_impl(a(0), a(1)),
        1 => op_sub_2_impl(a(0), a(1)),
        2 => op_mul_2_impl(a(0), a(1)),
        3 => op_div_2_impl(a(0), a(1)),
        4 => op_mod_2_impl(a(0), a(1)),
        5 => op_pow_2_impl(a(0), a(1)),
        6 => op_pos_1_impl(a(0)),
        7 => op_neg_1_impl(a(0)),
        8 => op_eq_2_impl(a(0), a(1)),
        9 => op_ne_2_impl(a(0), a(1)),
        10 => op_lt_2_impl(a(0), a(1)),
        11 => op_gt_2_impl(a(0), a(1)),
        12 => op_le_2_impl(a(0), a(1)),
        13 => op_ge_2_impl(a(0), a(1)),
        14 => op_and_2_impl(a(0), a(1)),
        15 => op_or_2_impl(a(0), a(1)),
        16 => op_not_1_impl(a(0)),
        17 => op_d_1_impl(a(0)),
        18 => op_d_2_impl(a(0), a(1)),
        19 => op_range_1_impl(a(0)),
        20 => op_range_2_impl(a(0), a(1)),
        21 => bf_reroll_2_impl(a(0), a(1)),
        22 => bf_explode_2_impl(a(0), a(1)),
        23 => bf_count_2_impl(a(0), a(1)),
        24 => bf_sum_1_impl(a(0)),
        25 => bf_product_1_impl(a(0)),
        26 => bf_any_1_impl(a(0)),
        27 => bf_sort_1_impl(a(0)),
        28 => bf_append_2_impl(a(0), a(1)),
        29 => bf_at_2_impl(a(0), a(1)),
        30 => bf_map_2_impl(a(0), a(1)),
        31 => bf_filter_2_impl(a(0), a(1)),
        32 => bf_head_1_impl(a(0)),
        33 => bf_tail_1_impl(a(0)),
        34 => bf_zip_2_impl(a(0), a(1)),
        35 => bf_zipWith_3_impl(a(0), a(1), a(2)),
        // --- v0.7 (contracts: nova/docs/v0.7-contracts.md) ---
        36 => bf_abs_1_impl(a(0)),
        37 => bf_count_1_impl(a(0)),
        38 => bf_has_2_impl(a(0), a(1)),
        39 => bf_min_1_impl(a(0)),
        40 => bf_max_1_impl(a(0)),
        41 => bf_all_1_impl(a(0)),
        42 => bf_sort_2_impl(a(0), a(1)),
        43 => bf_reverse_1_impl(a(0)),
        44 => bf_concat_2_impl(a(0), a(1)),
        45 => bf_prepend_2_impl(a(0), a(1)),
        46 => bf_at_3_impl(a(0), a(1), a(2)),
        47 => bf_duplicate_2_impl(a(0), a(1)),
        48 => bf_flatten_2_impl(a(0), a(1)),
        49 => bf_flattenAll_1_impl(a(0)),
        50 => bf_flatMap_2_impl(a(0), a(1)),
        51 => bf_foldl_3_impl(a(0), a(1), a(2)),
        52 => bf_foldr_3_impl(a(0), a(1), a(2)),
        53 => bf_unfold_2_impl(a(0), a(1)),
        54 => bf_iterate_2_impl(a(0), a(1)),
        55 => bf_last_1_impl(a(0)),
        56 => bf_init_1_impl(a(0)),
        57 => bf_take_2_impl(a(0), a(1)),
        58 => bf_takeWhile_2_impl(a(0), a(1)),
        59 => bf_drop_2_impl(a(0), a(1)),
        60 => bf_dropWhile_2_impl(a(0), a(1)),
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// WASM exports (imported by program modules from `nova_rt` by name)
// ---------------------------------------------------------------------------

macro_rules! export1 {
    ($name:ident, $impl:ident) => {
        #[no_mangle]
        #[allow(non_snake_case)]
        pub extern "C" fn $name(a: i64) -> i64 {
            $impl(a as u64) as i64
        }
    };
}
macro_rules! export2 {
    ($name:ident, $impl:ident) => {
        #[no_mangle]
        #[allow(non_snake_case)]
        pub extern "C" fn $name(a: i64, b: i64) -> i64 {
            $impl(a as u64, b as u64) as i64
        }
    };
}

export2!(op_add_2, op_add_2_impl);
export2!(op_sub_2, op_sub_2_impl);
export2!(op_mul_2, op_mul_2_impl);
export2!(op_div_2, op_div_2_impl);
export2!(op_mod_2, op_mod_2_impl);
export2!(op_pow_2, op_pow_2_impl);
export1!(op_pos_1, op_pos_1_impl);
export1!(op_neg_1, op_neg_1_impl);
export2!(op_eq_2, op_eq_2_impl);
export2!(op_ne_2, op_ne_2_impl);
export2!(op_lt_2, op_lt_2_impl);
export2!(op_gt_2, op_gt_2_impl);
export2!(op_le_2, op_le_2_impl);
export2!(op_ge_2, op_ge_2_impl);
export2!(op_and_2, op_and_2_impl);
export2!(op_or_2, op_or_2_impl);
export1!(op_not_1, op_not_1_impl);
export1!(op_d_1, op_d_1_impl);
export2!(op_d_2, op_d_2_impl);
export1!(op_range_1, op_range_1_impl);
export2!(op_range_2, op_range_2_impl);
export2!(bf_reroll_2, bf_reroll_2_impl);
export2!(bf_explode_2, bf_explode_2_impl);
export2!(bf_count_2, bf_count_2_impl);
export1!(bf_sum_1, bf_sum_1_impl);
export1!(bf_product_1, bf_product_1_impl);
export1!(bf_any_1, bf_any_1_impl);
export1!(bf_sort_1, bf_sort_1_impl);
export2!(bf_append_2, bf_append_2_impl);
export2!(bf_at_2, bf_at_2_impl);
export2!(bf_map_2, bf_map_2_impl);
export2!(bf_filter_2, bf_filter_2_impl);
export1!(bf_head_1, bf_head_1_impl);
export1!(bf_tail_1, bf_tail_1_impl);
export2!(bf_zip_2, bf_zip_2_impl);

// --- v0.7 (ids 36–60; contracts: nova/docs/v0.7-contracts.md) ---
export1!(bf_abs_1, bf_abs_1_impl);
export1!(bf_count_1, bf_count_1_impl);
export2!(bf_has_2, bf_has_2_impl);
export1!(bf_min_1, bf_min_1_impl);
export1!(bf_max_1, bf_max_1_impl);
export1!(bf_all_1, bf_all_1_impl);
export2!(bf_sort_2, bf_sort_2_impl);
export1!(bf_reverse_1, bf_reverse_1_impl);
export2!(bf_concat_2, bf_concat_2_impl);
export2!(bf_prepend_2, bf_prepend_2_impl);
export2!(bf_duplicate_2, bf_duplicate_2_impl);
export2!(bf_flatten_2, bf_flatten_2_impl);
export1!(bf_flattenAll_1, bf_flattenAll_1_impl);
export2!(bf_flatMap_2, bf_flatMap_2_impl);
export2!(bf_unfold_2, bf_unfold_2_impl);
export2!(bf_iterate_2, bf_iterate_2_impl);
export1!(bf_last_1, bf_last_1_impl);
export1!(bf_init_1, bf_init_1_impl);
export2!(bf_take_2, bf_take_2_impl);
export2!(bf_takeWhile_2, bf_takeWhile_2_impl);
export2!(bf_drop_2, bf_drop_2_impl);
export2!(bf_dropWhile_2, bf_dropWhile_2_impl);

#[allow(non_snake_case)]
#[no_mangle]
pub extern "C" fn bf_zipWith_3(a: i64, b: i64, c: i64) -> i64 {
    bf_zipWith_3_impl(a as u64, b as u64, c as u64) as i64
}

#[no_mangle]
pub extern "C" fn bf_at_3(a: i64, b: i64, c: i64) -> i64 {
    bf_at_3_impl(a as u64, b as u64, c as u64) as i64
}

#[no_mangle]
pub extern "C" fn bf_foldl_3(a: i64, b: i64, c: i64) -> i64 {
    bf_foldl_3_impl(a as u64, b as u64, c as u64) as i64
}

#[no_mangle]
pub extern "C" fn bf_foldr_3(a: i64, b: i64, c: i64) -> i64 {
    bf_foldr_3_impl(a as u64, b as u64, c as u64) as i64
}
