//! All 36 builtins from the ABI table.
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
        return errors::illegal_lr_type_mismatch(is_eq);
    }
    let same = if value_tag(va) == TAG_INTEGER {
        value_to_integer(va) == value_to_integer(vb)
    } else {
        value_to_boolean(va) == value_to_boolean(vb)
    };
    bool_result(if is_eq { same } else { !same })
}

pub(crate) fn op_lt_2_impl(a: u64, b: u64) -> u64 {
    bin_int(a, b, |x, y| bool_result(x < y))
}
pub(crate) fn op_gt_2_impl(a: u64, b: u64) -> u64 {
    bin_int(a, b, |x, y| bool_result(x > y))
}
pub(crate) fn op_le_2_impl(a: u64, b: u64) -> u64 {
    bin_int(a, b, |x, y| bool_result(x <= y))
}
pub(crate) fn op_ge_2_impl(a: u64, b: u64) -> u64 {
    bin_int(a, b, |x, y| bool_result(x >= y))
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
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// WASM exports (imported by program modules from `nova_rt` by name)
// ---------------------------------------------------------------------------

macro_rules! export1 {
    ($name:ident, $impl:ident) => {
        #[no_mangle]
        pub extern "C" fn $name(a: i64) -> i64 {
            $impl(a as u64) as i64
        }
    };
}
macro_rules! export2 {
    ($name:ident, $impl:ident) => {
        #[no_mangle]
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

#[allow(non_snake_case)]
#[no_mangle]
pub extern "C" fn bf_zipWith_3(a: i64, b: i64, c: i64) -> i64 {
    bf_zipWith_3_impl(a as u64, b as u64, c as u64) as i64
}
