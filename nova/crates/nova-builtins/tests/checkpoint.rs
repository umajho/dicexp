//! Checkpoint tests (plan §3.9): unarmed no-op, deadline comparison, the
//! `RESTRICTION_EXCEEDED_SOFT_TIMEOUT` ERROR object, `reset()` disarming, and
//! the `now_mock` fallback to real time.
//!
//! The mock and the armed state are thread-local, and cargo runs tests
//! multi-threaded — each test gets its own thread, so setting the mock per
//! test is safe.

mod common;

use common::*;
use dicexp_nova_builtins::checkpoint::now_mock;
use dicexp_nova_builtins::runtime::*;
use dicexp_nova_builtins::testutil as tu;

/// 0 = unarmed/continue; a fired checkpoint is a non-zero ERROR handle.
const KEY_SOFT_TIMEOUT: u32 = 3; // abi::error_key::RESTRICTION_EXCEEDED_SOFT_TIMEOUT
const KIND_ERROR: u8 = 6; // abi::kind::ERROR
const TAG_INT: u8 = 0; // abi::param_tag::INT

#[test]
fn unarmed_checkpoint_returns_zero() {
    setup(); // reset() disarms
    now_mock::set(Some(|| 1_000.0));
    assert_eq!(__checkpoint(), 0);
}

#[test]
fn armed_with_future_deadline_returns_zero() {
    setup();
    now_mock::set(Some(|| 1_000.0));
    set_soft_timeout(2_000.0, 10);
    assert_eq!(__checkpoint(), 0);
}

#[test]
fn armed_at_exact_deadline_returns_zero() {
    setup();
    // naive's comparison is strict (`duration > timeout.ms`): at the deadline
    // exactly, the checkpoint has not fired yet.
    now_mock::set(Some(|| 2_000.0));
    set_soft_timeout(2_000.0, 10);
    assert_eq!(__checkpoint(), 0);
}

#[test]
fn armed_past_deadline_returns_soft_timeout_error() {
    setup();
    now_mock::set(Some(|| 2_000.0));
    set_soft_timeout(1_999.0, 25);
    let h = __checkpoint();
    assert_ne!(h, 0);
    assert_eq!(tu::kind_of(h), KIND_ERROR);
    assert_eq!(err_key(h), KEY_SOFT_TIMEOUT);
    // params: [(int 25)] — the limit, for the localized message
    // "越过外加限制「运行时间」（允许 25 毫秒）".
    assert_eq!(err_params(h), vec![(TAG_INT, 25)]);
    assert_eq!(int_err_params(h), vec![25]);
    // Fires again on the next checkpoint (not memoized).
    assert_eq!(err_key(__checkpoint()), KEY_SOFT_TIMEOUT);
}

#[test]
fn checkpoint_uses_now_at_each_call() {
    setup();
    // First checkpoint before the deadline, second after: only the second
    // fires (the deadline is read per checkpoint, not at arm time). The mock
    // is a plain fn pointer, so the time lives in a thread-local cell.
    use std::cell::Cell;
    thread_local! {
        static NOW: Cell<f64> = const { Cell::new(1_000.0) };
    }
    fn now() -> f64 {
        NOW.with(Cell::get)
    }
    now_mock::set(Some(now));
    set_soft_timeout(1_500.0, 10);
    assert_eq!(__checkpoint(), 0);
    NOW.with(|c| c.set(1_501.0));
    assert_eq!(err_key(__checkpoint()), KEY_SOFT_TIMEOUT);
}

#[test]
fn reset_disarms() {
    setup();
    now_mock::set(Some(|| 2_000.0));
    set_soft_timeout(1_000.0, 10);
    assert_ne!(__checkpoint(), 0);
    reset();
    assert_eq!(__checkpoint(), 0, "reset() must disarm");
    // Re-arming works after a reset.
    set_soft_timeout(1_000.0, 7);
    assert_eq!(int_err_params(__checkpoint()), vec![7]);
}

#[test]
fn unset_mock_defaults_to_real_time() {
    setup();
    now_mock::set(None);
    // Deadline at the Unix epoch: any real now (≈2026) is strictly past it.
    set_soft_timeout(0.0, 10);
    assert_eq!(err_key(__checkpoint()), KEY_SOFT_TIMEOUT);
    // And a far-future deadline (1e14 ms ≈ year 5138) never fires under
    // real time.
    set_soft_timeout(1.0e14, 10);
    assert_eq!(__checkpoint(), 0);
}
