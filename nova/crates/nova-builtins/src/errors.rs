//! Structured runtime error constructors (ABI §3.7).
//!
//! Error keys defined in `nova-abi` are re-used as-is. Keys the ABI does not
//! (yet) define are defined HERE and should be upstreamed to `nova-abi`
//! (see the crate report); they continue the runtime range 1..=999.

use dicexp_nova_abi as abi;
use abi::{error_key as k, param_tag};

use crate::values;

/// Error keys missing from `nova-abi` (upstream candidates).
pub(crate) mod extra_key {
    /// params: [string name] — builtin not implemented yet (reroll/2, explode/2).
    pub const UNIMPLEMENTED: u32 = 41;
    /// params: [string rendered_operation] — `==`/`!=` with operands of
    /// different types (naive: 操作 “==” 非法：两侧操作数的类型不相同).
    pub const ILLEGAL_OPERATION_LR_TYPE_MISMATCH: u32 = 42;
    /// params: [int list_length, int index] — naive: 访问列表越界：…
    pub const AT_INDEX_OUT_OF_BOUNDS: u32 = 43;
    /// params: [] — head/tail on an empty list (naive: 列表为空).
    pub const EMPTY_LIST: u32 = 44;
    /// params: [] — sum/product on a list with a non-integer item
    /// (naive: 传入的列表存在非「数字」项).
    pub const LIST_HAS_NON_INTEGER_ITEM: u32 = 45;
    /// params: [] — any? on a list with a non-boolean item
    /// (naive: 传入的列表存在非「布尔」项).
    pub const LIST_HAS_NON_BOOLEAN_ITEM: u32 = 46;
    /// params: [] — sort on an unsupported list (naive: 传入的列表不支持排序).
    pub const LIST_NOT_SORTABLE: u32 = 47;
    /// params: [int position, string name, valtype expected, valtype actual] —
    /// naive's givenClosureReturnValueTypeMismatch (filter/count; position 2).
    pub const CLOSURE_RETURN_TYPE_MISMATCH: u32 = 48;
    /// params: [valtype actual] — `#` count is not an integer
    /// (naive: 反复次数期待「整数」，实际类型为「…」).
    pub const REPEAT_COUNT_TYPE_MISMATCH: u32 = 49;
}

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

/// "`==`" / "`!=`" alone (naive passes the bare operator as the operation).
pub(crate) fn illegal_lr_type_mismatch(op_eq: bool) -> u64 {
    rendered_to_error(
        extra_key::ILLEGAL_OPERATION_LR_TYPE_MISMATCH,
        if op_eq { b"==" } else { b"!=" },
    )
}

// ---------------------------------------------------------------------------
// extra-key constructors
// ---------------------------------------------------------------------------

pub(crate) fn unimplemented(name: &str) -> u64 {
    match values::string_new(name.as_bytes()) {
        Some(s) => values::error_new(extra_key::UNIMPLEMENTED, &[(STR, s as u64)]),
        None => memory_limit(),
    }
}

pub(crate) fn at_index_out_of_bounds(list_len: i64, index: i64) -> u64 {
    values::error_new(
        extra_key::AT_INDEX_OUT_OF_BOUNDS,
        &[(INT, list_len as u64), (INT, index as u64)],
    )
}

pub(crate) fn empty_list() -> u64 {
    values::error_new(extra_key::EMPTY_LIST, &[])
}

pub(crate) fn list_has_non_integer_item() -> u64 {
    values::error_new(extra_key::LIST_HAS_NON_INTEGER_ITEM, &[])
}

pub(crate) fn list_has_non_boolean_item() -> u64 {
    values::error_new(extra_key::LIST_HAS_NON_BOOLEAN_ITEM, &[])
}

pub(crate) fn list_not_sortable() -> u64 {
    values::error_new(extra_key::LIST_NOT_SORTABLE, &[])
}

/// naive's `givenClosureReturnValueTypeMismatch`; `position` is the 1-based
/// position of the closure argument (always 2 in v0.1 builtins).
pub(crate) fn closure_return_type_mismatch(
    position: u32,
    name: &str,
    expected: u8,
    actual: u8,
) -> u64 {
    match values::string_new(name.as_bytes()) {
        Some(s) => values::error_new(
            extra_key::CLOSURE_RETURN_TYPE_MISMATCH,
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
    values::error_new(extra_key::REPEAT_COUNT_TYPE_MISMATCH, &[(VT, actual as u64)])
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
}
