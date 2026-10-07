//! Structured runtime error constructors (ABI §3.7).
//!
//! All error keys live in `nova-abi` (`error_key`); this module only holds
//! the constructors. (The temporary `extra_key` shadow definitions were
//! upstreamed to nova-abi; keys are ABI-stable — never reassign.)

use dicexp_nova_abi as abi;
use abi::{error_key as k, param_tag};

use crate::values;

const INT: u8 = param_tag::INT;
const STR: u8 = param_tag::STRING;
const VT: u8 = param_tag::VALUE_TYPE;
const VTS: u8 = param_tag::VALUE_TYPE_SET;

// ---------------------------------------------------------------------------
// simple constructors
// ---------------------------------------------------------------------------

pub(crate) fn limitation_max() -> u64 {
    values::error_new(
        k::LIMITATION_EXCEEDED_MAX_SAFE_INTEGER,
        &[(INT, abi::MAX_SAFE_INTEGER as u64)],
    )
}

pub(crate) fn limitation_min() -> u64 {
    values::error_new(
        k::LIMITATION_EXCEEDED_MIN_SAFE_INTEGER,
        &[(INT, (abi::MIN_SAFE_INTEGER) as u64)],
    )
}

/// Soft-timeout checkpoint fired (plan §3.9); `limit_ms` is the configured
/// limit. params: [int ms] (naive: 越过外加限制「运行时间」（允许 … 毫秒）).
pub(crate) fn restriction_exceeded_soft_timeout(limit_ms: i64) -> u64 {
    values::error_new(
        k::RESTRICTION_EXCEEDED_SOFT_TIMEOUT,
        &[(INT, limit_ms as u64)],
    )
}

pub(crate) fn wrong_arity_closure(expected: u32, actual: u32) -> u64 {
    values::error_new(
        k::WRONG_ARITY_CLOSURE,
        &[(INT, expected as u64), (INT, actual as u64)],
    )
}

pub(crate) fn wrong_arity_captured(expected: u32, actual: u32) -> u64 {
    values::error_new(
        k::WRONG_ARITY_CAPTURED,
        &[(INT, expected as u64), (INT, actual as u64)],
    )
}

/// 1-based `position`.
pub(crate) fn call_argument_type_mismatch(position: u32, expected_mask: u8, actual: u8) -> u64 {
    values::error_new(
        k::CALL_ARGUMENT_TYPE_MISMATCH,
        &[
            (INT, position as u64),
            (VTS, expected_mask as u64),
            (VT, actual as u64),
        ],
    )
}

pub(crate) fn value_is_not_callable() -> u64 {
    values::error_new(k::VALUE_IS_NOT_CALLABLE, &[])
}

pub(crate) fn bad_final_result(actual: u8) -> u64 {
    values::error_new(k::BAD_FINAL_RESULT, &[(VT, actual as u64)])
}

pub(crate) fn memory_limit() -> u64 {
    values::oom_handle()
}

// ---------------------------------------------------------------------------
// illegal-operation errors with rendered-operation strings
// ---------------------------------------------------------------------------

/// Port of naive's `renderOperation` (operators/definitions.ts):
/// `left op right`, `${op} ${right}` when left is null, `${left} ${op}` when
/// right is null. Call sites replicate naive's exact operand rendering,
/// including `(${a})` parenthesization of negative left operands for `%`.
fn rendered_to_error(key: u32, rendered: &[u8]) -> u64 {
    match values::string_new(rendered) {
        Some(s) => values::error_new(key, &[(STR, s as u64)]),
        None => memory_limit(),
    }
}

fn push_str(buf: &mut [u8], mut n: usize, s: &str) -> usize {
    let b = s.as_bytes();
    buf[n..n + b.len()].copy_from_slice(b);
    n += b.len();
    n
}

fn push_i64(buf: &mut [u8], mut n: usize, v: i64) -> usize {
    let mut tmp = [0u8; 20];
    let mut len = 0;
    let mut x = (v as i128).unsigned_abs();
    loop {
        tmp[len] = b'0' + (x % 10) as u8;
        x /= 10;
        len += 1;
        if x == 0 {
            break;
        }
    }
    if v < 0 {
        buf[n] = b'-';
        n += 1;
    }
    while len > 0 {
        len -= 1;
        buf[n] = tmp[len];
        n += 1;
    }
    n
}

/// "`a // b`" (div-by-zero; naive does NOT parenthesize here).
pub(crate) fn illegal_div_by_zero(a: i64, b: i64) -> u64 {
    let mut buf = [0u8; 64];
    let mut n = 0;
    n = push_i64(&mut buf, n, a);
    n = push_str(&mut buf, n, " // ");
    n = push_i64(&mut buf, n, b);
    rendered_to_error(k::ILLEGAL_OPERATION_DIV_BY_ZERO, &buf[..n])
}

/// "`(a) % b`" with parenthesized negative left operand (a < 0 branch).
pub(crate) fn illegal_mod_negative_dividend(a: i64, b: i64) -> u64 {
    let mut buf = [0u8; 64];
    let mut n = 0;
    if a < 0 {
        buf[n] = b'(';
        n += 1;
        n = push_i64(&mut buf, n, a);
        buf[n] = b')';
        n += 1;
    } else {
        n = push_i64(&mut buf, n, a);
    }
    n = push_str(&mut buf, n, " % ");
    n = push_i64(&mut buf, n, b);
    rendered_to_error(k::ILLEGAL_OPERATION_MOD_NEGATIVE_DIVIDEND, &buf[..n])
}

/// "`a % b`" (non-positive divisor branch; a >= 0 there by construction).
pub(crate) fn illegal_mod_non_positive_divisor(a: i64, b: i64) -> u64 {
    let mut buf = [0u8; 64];
    let mut n = 0;
    if a < 0 {
        buf[n] = b'(';
        n += 1;
        n = push_i64(&mut buf, n, a);
        buf[n] = b')';
        n += 1;
    } else {
        n = push_i64(&mut buf, n, a);
    }
    n = push_str(&mut buf, n, " % ");
    n = push_i64(&mut buf, n, b);
    rendered_to_error(k::ILLEGAL_OPERATION_MOD_NON_POSITIVE_DIVISOR, &buf[..n])
}

/// "`a ** n`" (naive does NOT parenthesize a negative base here).
pub(crate) fn illegal_pow_negative_exponent(a: i64, n_exp: i64) -> u64 {
    let mut buf = [0u8; 64];
    let mut n = 0;
    n = push_i64(&mut buf, n, a);
    n = push_str(&mut buf, n, " ** ");
    n = push_i64(&mut buf, n, n_exp);
    rendered_to_error(k::ILLEGAL_OPERATION_POW_NEGATIVE_EXPONENT, &buf[..n])
}

/// Range upper-bound error. Mirrors naive's `ensureUpperBound`:
/// for `d` the left operand is HARDCODED to `1` in naive (quirk replicated:
/// `d 0` and `5 d 0` both render "1 d 0"); for `~` the left is null, rendering
/// "`~ upper`".
pub(crate) fn illegal_range_upper_bound_d(actual: i64) -> u64 {
    let mut buf = [0u8; 64];
    let mut n = 0;
    n = push_str(&mut buf, n, "1 d ");
    n = push_i64(&mut buf, n, actual);
    range_upper_bound_error(&buf[..n], 1, actual)
}

pub(crate) fn illegal_range_upper_bound_range(actual: i64) -> u64 {
    let mut buf = [0u8; 64];
    let mut n = 0;
    n = push_str(&mut buf, n, "~ ");
    n = push_i64(&mut buf, n, actual);
    range_upper_bound_error(&buf[..n], 1, actual)
}

fn range_upper_bound_error(rendered: &[u8], min: i64, actual: i64) -> u64 {
    match values::string_new(rendered) {
        Some(s) => values::error_new(
            k::ILLEGAL_OPERATION_RANGE_UPPER_BOUND,
            &[(STR, s as u64), (INT, min as u64), (INT, actual as u64)],
        ),
        None => memory_limit(),
    }
}

/// Bare rendered operator (naive passes the bare operator as the operation):
/// `==`/`!=`, and (v0.7) `<`/`>`/`<=`/`>=` with operands of different types.
pub(crate) fn illegal_lr_type_mismatch(op: &str) -> u64 {
    rendered_to_error(k::ILLEGAL_OPERATION_LR_TYPE_MISMATCH, op.as_bytes())
}

// ---------------------------------------------------------------------------
// extra-key constructors
// ---------------------------------------------------------------------------

pub(crate) fn at_index_out_of_bounds(list_len: i64, index: i64) -> u64 {
    values::error_new(
        k::AT_INDEX_OUT_OF_BOUNDS,
        &[(INT, list_len as u64), (INT, index as u64)],
    )
}

pub(crate) fn empty_list() -> u64 {
    values::error_new(k::EMPTY_LIST, &[])
}

pub(crate) fn list_has_non_integer_item() -> u64 {
    values::error_new(k::LIST_HAS_NON_INTEGER_ITEM, &[])
}

pub(crate) fn list_has_non_boolean_item() -> u64 {
    values::error_new(k::LIST_HAS_NON_BOOLEAN_ITEM, &[])
}

pub(crate) fn list_not_sortable() -> u64 {
    values::error_new(k::LIST_NOT_SORTABLE, &[])
}

/// naive's `givenClosureReturnValueTypeMismatch`; `position` is the 1-based
/// position of the closure argument.
pub(crate) fn closure_return_type_mismatch(
    position: u32,
    name: &str,
    expected: u8,
    actual: u8,
) -> u64 {
    match values::string_new(name.as_bytes()) {
        Some(s) => values::error_new(
            k::CLOSURE_RETURN_TYPE_MISMATCH,
            &[
                (INT, position as u64),
                (STR, s as u64),
                (VT, expected as u64),
                (VT, actual as u64),
            ],
        ),
        None => memory_limit(),
    }
}

pub(crate) fn repeat_count_type_mismatch(actual: u8) -> u64 {
    values::error_new(k::REPEAT_COUNT_TYPE_MISMATCH, &[(VT, actual as u64)])
}

// ---------------------------------------------------------------------------
// v0.7 keys (contracts: nova/docs/v0.7-contracts.md)
// ---------------------------------------------------------------------------

/// `has?` scan hit a non-integer/non-boolean element
/// (zh: 传入的列表存在非「整数或布尔」项).
pub(crate) fn list_has_non_scalar_item() -> u64 {
    values::error_new(k::LIST_HAS_NON_SCALAR_ITEM, &[])
}

/// unfold step returned neither `false` nor a list.
pub(crate) fn unfold_step_type_mismatch(actual: u8) -> u64 {
    values::error_new(k::UNFOLD_STEP_TYPE_MISMATCH, &[(VT, actual as u64)])
}

/// unfold step list had ≠ 2 elements.
pub(crate) fn unfold_step_list_length_mismatch(actual_len: i64) -> u64 {
    values::error_new(
        k::UNFOLD_STEP_LIST_LENGTH_MISMATCH,
        &[(INT, actual_len as u64)],
    )
}

/// Masks used by builtin parameter specs.
pub(crate) mod mask {
    use dicexp_nova_abi::value_type as t;
    use dicexp_nova_abi::value_type::set_mask;

    pub const INTEGER: u8 = set_mask(&[t::INTEGER]);
    pub const BOOLEAN: u8 = set_mask(&[t::BOOLEAN]);
    pub const INTEGER_OR_BOOLEAN: u8 = set_mask(&[t::INTEGER, t::BOOLEAN]);
    pub const LIST: u8 = set_mask(&[t::LIST]);
    pub const CALLABLE: u8 = set_mask(&[t::CALLABLE]);
    pub const SEQUENCE_ANY: u8 = set_mask(&[t::SEQUENCE, t::SEQUENCE_SUM]);
    /// `take/2` / `drop/2` arg 1: a list or either sequence flavor. The
    /// mask INCLUDES the sequence types, so no implicit cast fires — the
    /// builtin branches on the heap kind itself.
    pub const LIST_OR_SEQUENCE_ANY: u8 = set_mask(&[t::LIST, t::SEQUENCE, t::SEQUENCE_SUM]);
}
