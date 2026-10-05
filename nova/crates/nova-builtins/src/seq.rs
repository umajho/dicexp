//! Sequence streams (ABI §3.5): lazy pull-streams with per-position
//! memoization (issue #20) and nominal lengths, plus the implicit casts
//! (`sequence$sum` → sum, `sequence` → list).
//!
//! v0.1 has two sources (reroll/explode transformers are stubbed):
//! - dice-sum streams (`d`, `~`): elements are integers drawn from the RNG
//!   at pull time — matching naive, whose `sequence$sum` yielder draws per
//!   pull. Infinite actual length; the nominal length is 1 for `~` and `n`
//!   for `n d x`.
//! - repeat streams (`#`): each position yields an UNEVALUATED sentinel thunk
//!   calling the body closure, created at pull time — matching naive, whose
//!   repetition yielder stores a fresh lazy box per position without forcing
//!   it. This keeps RNG consumption inside repeat bodies lazy exactly like
//!   naive.

use dicexp_nova_abi as abi;

use crate::errors;
use crate::rng;
use crate::values;

/// Create the `sequence$sum` stream for `lower ~ upper` / `n d x`.
pub(crate) fn new_dice_sum(lower: i64, upper: i64, nominal: u64) -> u64 {
    values::sequence_new(
        true,
        values::SEQ_SOURCE_DICE_SUM,
        lower as u64,
        upper as u64,
        nominal,
    )
}

/// Create the plain `sequence` stream for `count # body`.
/// `closure_offset` is the byte offset of the (already forced) CLOSURE object.
pub(crate) fn new_repeat(closure_offset: u32, nominal: u64) -> u64 {
    values::sequence_new(
        false,
        values::SEQ_SOURCE_REPEAT,
        closure_offset as u64,
        0,
        nominal,
    )
}

#[inline]
pub(crate) fn is_sequence(v: u64) -> bool {
    values::heap_kind(v) == Some(abi::kind::SEQUENCE)
}

/// Pull position `index`, memoizing per position. Positions must be pulled in
/// order (all v0.1 consumers pull 0..nominal sequentially).
///
/// Returns the drawn integer (dice-sum source) or an unevaluated element
/// handle (repeat source), as a value/handle u64. `Err` propagates an error
/// handle (only allocation failures can fail here).
fn pull(seq_ptr: u32, index: u64) -> Result<u64, u64> {
    let memo_len = values::seq_memo_len(seq_ptr) as u64;
    if index < memo_len {
        return Ok(values::seq_memo_get(seq_ptr, index as u32));
    }
    // index == memo_len (sequential pulls); produce the next position.
    let slot = match values::seq_source(seq_ptr) {
        values::SEQ_SOURCE_DICE_SUM => {
            let lower = values::seq_a(seq_ptr) as i64;
            let upper = values::seq_b(seq_ptr) as i64;
            values::integer_to_value(rng::integer(lower, upper))
        }
        // repeat: a fresh sentinel thunk per position (see module docs).
        _ => values::thunk_new(
            values::SENTINEL_REPEAT_FNIDX,
            values::seq_a(seq_ptr) as u32,
        ),
    };
    if values::is_error_handle(slot) {
        return Err(slot);
    }
    if !values::seq_memo_push(seq_ptr, slot) {
        return Err(errors::memory_limit());
    }
    Ok(slot)
}

/// Implicit cast of a `sequence$sum` to its sum (naive: reduce over the
/// nominal list). Draws the nominal positions in order.
///
/// [DEVIATION] naive summed with unchecked doubles (garbage past 2^53);
/// we accumulate exactly in i128 and raise `limitationExceeded` beyond
/// ±(2^53−1) — see compat.md "limitation checks" and the crate report.
pub(crate) fn cast_to_sum(seq_ptr: u32) -> Result<i64, u64> {
    let nominal = values::seq_nominal(seq_ptr);
    let mut acc: i128 = 0;
    let mut i = 0u64;
    while i < nominal {
        let slot = pull(seq_ptr, i)?;
        // Dice-sum elements are always plain integers.
        acc += values::value_to_integer(slot) as i128;
        i += 1;
    }
    if acc > abi::MAX_SAFE_INTEGER as i128 {
        Err(errors::limitation_max())
    } else if acc < abi::MIN_SAFE_INTEGER as i128 {
        Err(errors::limitation_min())
    } else {
        Ok(acc as i64)
    }
}

/// Implicit cast of a `sequence` to a list of its nominal elements
/// (naive: `createValue.list(nominalList)`). Element handles are handed out
/// unforced, exactly like naive's lazy boxes.
pub(crate) fn cast_to_list(seq_ptr: u32) -> Result<u64, u64> {
    let nominal = values::seq_nominal(seq_ptr);
    if nominal > u32::MAX as u64 {
        return Err(errors::memory_limit());
    }
    let list = match values::list_new_fallible(nominal as u32) {
        Some(p) => p,
        None => return Err(errors::memory_limit()),
    };
    let mut i = 0u64;
    while i < nominal {
        let slot = pull(seq_ptr, i)?;
        values::list_set(list, i as u32, slot);
        i += 1;
    }
    Ok(values::heap_ptr_to_value(list))
}
