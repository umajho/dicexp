//! Sequence streams (ABI §3.5): lazy pull-streams with per-position
//! memoization (issue #20) and nominal lengths, plus the implicit casts
//! (`sequence$sum` → sum, `sequence` → list).
//!
//! Sources (the SEQUENCE object's `source_tag`; see `values.rs` for the
//! per-kind layouts):
//! - dice-sum streams (`d`, `~`): elements are integers drawn from the RNG
//!   at pull time — matching naive, whose `sequence$sum` yielder draws per
//!   pull. Infinite actual length; the nominal length is 1 for `~` and `n`
//!   for `n d x`.
//! - repeat streams (`#`): each position yields an UNEVALUATED sentinel
//!   thunk calling the body closure, created at pull time — matching naive,
//!   whose repetition yielder stores a fresh lazy box per position without
//!   forcing it. This keeps RNG consumption inside repeat bodies lazy
//!   exactly like naive.
//! - reroll/explode transformer streams (naive's
//!   `createValue.sequenceTransformer`): each demanded output pulls the
//!   source one position further, calls the closure on the source item
//!   (unforced, exactly as memoized), and runs naive's debt bookkeeping to
//!   decide whether an output is produced and whether it is the nominal
//!   last. A closure error or non-boolean closure result is a TERMINAL
//!   error output (marked last); production ends there.
//!
//! Both base arms are INFINITE beyond their nominal end (is_last only at
//! nominal−1, is_last=false beyond): transformers legitimately pull sources
//! past their nominal end (rerolls, explosions, and chained transformers
//! whose outer rejects the inner's last-marked output) — the dice arm keeps
//! drawing and the repeat arm keeps creating body thunks, exactly like
//! naive's yielders.

use dicexp_nova_abi as abi;

use crate::errors;
use crate::mem;
use crate::rng;
use crate::runtime::{call_with_args, force_impl};
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

/// Create a reroll/explode transformer stream wrapping `source` (a
/// SEQUENCE value handle; its `sequence$sum` flag is mirrored by `is_sum`).
/// Construction pulls nothing — outputs are produced lazily per pull, so
/// RNG is only drawn as outputs are demanded (laziness preserved).
pub(crate) fn new_transformer(is_sum: bool, source: u64, closure: u64, is_explode: bool) -> u64 {
    values::sequence_new_transformer(is_sum, source, closure, is_explode)
}

#[inline]
pub(crate) fn is_sequence(v: u64) -> bool {
    values::heap_kind(v) == Some(abi::kind::SEQUENCE)
}

/// The result of pulling one position of a stream.
pub(crate) enum Pull {
    /// The position's value handle (integer, unevaluated element thunk or
    /// — for a terminal transformer error — an ERROR handle) and whether
    /// this position is the stream's nominal last (consumers pull until and
    /// including the first such position; the stream may continue beyond).
    Item(u64, bool),
    /// The stream has actually ended: no position exists here or ever after
    /// (only transformer streams end — terminal error, or their own source
    /// ended mid-production; naive's yielder returning null).
    Ended,
}

/// Pull position `index`, memoizing per position. Positions must be pulled
/// in order (every consumer pulls 0, 1, 2, …; memoized positions may be
/// re-read in any order).
///
/// Returns the drawn integer (dice-sum source), an unevaluated element
/// handle (repeat source) or a produced output (transformer source), plus
/// the nominal-last bit; `Pull::Ended` once a transformer stream has ended.
/// `Err` propagates an error handle (only allocation failures can fail
/// here; closure errors are values — terminal error *outputs*).
fn pull(seq_ptr: u32, index: u64) -> Result<Pull, u64> {
    let memo_len = values::seq_memo_len(seq_ptr) as u64;
    if index < memo_len {
        let slot = values::seq_memo_get(seq_ptr, index as u32);
        let is_last = match values::seq_source(seq_ptr) {
            // Transformer outputs memoize their is_last bit (the debt
            // bookkeeping cannot be recomputed).
            values::SEQ_SOURCE_TRANSFORMER => values::seq_t_is_last_at(seq_ptr, index as u32),
            // Dice/repeat: the nominal-last bit is positional.
            _ => index + 1 == values::seq_nominal(seq_ptr),
        };
        return Ok(Pull::Item(slot, is_last));
    }
    if index > memo_len {
        // Unreachable per the sequential-pull contract; treated defensively
        // as the end of the stream (never a panic/trap on wasm paths).
        return Ok(Pull::Ended);
    }
    // index == memo_len (sequential pulls); produce the next position.
    let (slot, is_last) = match values::seq_source(seq_ptr) {
        values::SEQ_SOURCE_DICE_SUM => {
            let lower = values::seq_a(seq_ptr) as i64;
            let upper = values::seq_b(seq_ptr) as i64;
            // Infinite beyond the nominal end (is_last at nominal−1 only).
            (
                values::integer_to_value(rng::integer(lower, upper)),
                index + 1 == values::seq_nominal(seq_ptr),
            )
        }
        // repeat: a fresh sentinel thunk per position (see module docs);
        // infinite beyond nominal−1 like the dice arm.
        values::SEQ_SOURCE_REPEAT => (
            values::thunk_new(
                values::SENTINEL_REPEAT_FNIDX,
                values::seq_a(seq_ptr) as u32,
            ),
            index + 1 == values::seq_nominal(seq_ptr),
        ),
        _ => {
            if values::seq_t_flag(seq_ptr, values::SEQ_T_ENDED) {
                return Ok(Pull::Ended);
            }
            return produce_transformer(seq_ptr);
        }
    };
    if values::is_error_handle(slot) {
        return Err(slot);
    }
    if !values::seq_memo_push(seq_ptr, slot) {
        return Err(errors::memory_limit());
    }
    Ok(Pull::Item(slot, is_last))
}

/// Produce the next transformer output (naive's transformer yielder body,
/// one output per pull). Loop per source pull — the cursor advances one
/// position per closure call, and `reroll`'s rejected items produce no
/// output (extra rolls happen by pulling the source more, never by calling
/// `rng` directly).
fn produce_transformer(p: u32) -> Result<Pull, u64> {
    let closure = values::seq_b(p);
    let is_explode = values::seq_t_flag(p, values::SEQ_T_EXPLODE);
    loop {
        let cursor = values::seq_t_cursor(p);
        let (item, src_is_last) =
            match pull(values::value_to_heap_ptr(values::seq_a(p)), cursor)? {
                Pull::Item(h, last) => (h, last),
                // The source has actually ended (e.g. a chained transformer
                // hit its terminal error): production ends WITHOUT an
                // output — naive's yielder returns null here.
                Pull::Ended => {
                    values::seq_t_set_flag(p, values::SEQ_T_ENDED, true);
                    return Ok(Pull::Ended);
                }
            };
        values::seq_t_set_cursor(p, cursor + 1);

        // Call the closure with the item exactly as memoized — unforced for
        // plain-sequence sources (naive passes the lazy box); already a
        // plain value for dice/$sum sources (naive wraps it in a direct
        // box). Either way: the same handle.
        let b = force_impl(call_with_args(closure, &[item]));
        if values::is_error_handle(b) {
            return terminal_error(p, b);
        }
        if values::value_tag(b) != values::TAG_BOOLEAN {
            // naive's tryUnwrapBoolean quirk: explode/2 reports
            // closure-return-type errors as if from reroll/2 (compat.md).
            let e = errors::closure_return_type_mismatch(
                2,
                "reroll/2",
                abi::value_type::BOOLEAN,
                values::value_type_of(b),
            );
            return terminal_error(p, e);
        }
        let pred = values::value_to_boolean(b);

        // Debt bookkeeping, in naive's exact order. `remain` is signed and
        // NOT clamped: chained transformers drive it negative (past a
        // stream's last-marked output no further output is ever last).
        if values::seq_t_flag(p, values::SEQ_T_TRACK) {
            values::seq_t_add_remain(p, 1);
        }
        if pred {
            values::seq_t_add_remain(p, 1);
        }
        values::seq_t_add_remain(p, -1);
        if src_is_last {
            values::seq_t_set_flag(p, values::SEQ_T_TRACK, false);
        }

        if !is_explode && pred {
            // reroll: the rejected item produces no output; pull the next
            // source position.
            continue;
        }
        // Recomputed per output (never latched): an output is the nominal
        // last iff the debt is paid and the base rolls are no longer
        // tracked.
        let is_last =
            values::seq_t_remain(p) == 0 && !values::seq_t_flag(p, values::SEQ_T_TRACK);
        if !values::seq_t_memo_push(p, item, is_last) {
            return Err(errors::memory_limit());
        }
        return Ok(Pull::Item(item, is_last));
    }
}

/// Emit `err` as this position's output (marked last) and end production:
/// the error is a VALUE — memoized like any output, flowing through
/// `cast_to_list` as an element handle — while further positions do not
/// exist (`Pull::Ended`). This mirrors naive's error box.
fn terminal_error(p: u32, err: u64) -> Result<Pull, u64> {
    if !values::seq_t_memo_push(p, err, true) {
        return Err(errors::memory_limit());
    }
    values::seq_t_set_flag(p, values::SEQ_T_ENDED, true);
    Ok(Pull::Item(err, true))
}

/// Implicit cast of a `sequence$sum` to its sum (naive: reduce over the
/// nominal list). Pulls outputs until — and including — the first output
/// marked is_last (explode discovers its nominal end dynamically), or until
/// the stream ends.
///
/// [DEVIATION] naive summed with unchecked doubles (garbage past 2^53);
/// we accumulate exactly in i128 and raise `limitationExceeded` beyond
/// ±(2^53−1) — see compat.md "limitation checks" and the crate report.
/// [DEVIATION] a terminal error output (e.g. a bad reroll/explode closure)
/// is reported cleanly instead of crashing as naive does (see compat.md).
pub(crate) fn cast_to_sum(seq_ptr: u32) -> Result<i64, u64> {
    let mut acc: i128 = 0;
    let mut i = 0u64;
    loop {
        let (slot, is_last) = match pull(seq_ptr, i)? {
            Pull::Item(h, last) => (h, last),
            Pull::Ended => break,
        };
        if values::is_error_handle(slot) {
            // Errors are values: a terminal error output surfaces as the
            // evaluation's error (naive crashes here instead).
            return Err(slot);
        }
        // Dice-sum and transformer-over-$sum outputs are always integers.
        acc += values::value_to_integer(slot) as i128;
        if is_last {
            break;
        }
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

/// Implicit cast of a `sequence` to a list of its elements (naive:
/// `createValue.list(nominalList)`). Pulls outputs until — and including —
/// the first output marked is_last, or until the stream ends (for dice and
/// repeat sources that is exactly the nominal 0..n−1, unchanged). Element
/// handles are handed out unforced, exactly like naive's lazy boxes; a
/// terminal error output flows through as an element handle.
pub(crate) fn cast_to_list(seq_ptr: u32) -> Result<u64, u64> {
    let mut collected = mem::Stack::new();
    let mut i = 0u64;
    loop {
        let (slot, is_last) = match pull(seq_ptr, i)? {
            Pull::Item(h, last) => (h, last),
            Pull::Ended => break,
        };
        if collected.push(slot).is_err() {
            return Err(errors::memory_limit());
        }
        if is_last {
            break;
        }
        i += 1;
    }
    let len = collected.len();
    let list = match values::list_new_fallible(len) {
        Some(p) => p,
        None => return Err(errors::memory_limit()),
    };
    let mut j = 0;
    while j < len {
        values::list_set(list, j, collected.get(j));
        j += 1;
    }
    Ok(values::heap_ptr_to_value(list))
}
