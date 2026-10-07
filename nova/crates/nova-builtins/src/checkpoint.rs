//! Soft-timeout checkpoint channel (plan §3.9).
//!
//! `nova_rt.__checkpoint` is the call-boundary checkpoint the compiler emits
//! at every regular-call and value-call site (naive parity: naive's
//! `reporter.called` fires on the first call forced after the deadline). It
//! returns 0 to continue, or a non-zero ERROR handle which the call site
//! returns as its own value ("errors are values" — no traps). While no
//! restriction is armed it is a pure no-op (a thread-local test — the
//! `env.now` host import is never called).
//!
//! State is thread-local like `rng`/`mem` (plan §3.9: native libtest threads
//! are isolated; on wasm it degenerates to a single-thread static).

use std::cell::Cell;

use crate::errors;

// ---------------------------------------------------------------------------
// env.now host import (JS Date.now on wasm; mock on native)
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn now() -> f64;
}

#[cfg(target_arch = "wasm32")]
fn host_now() -> f64 {
    unsafe { now() }
}

/// Native stand-in for the `env.now` host import so tests get deterministic
/// time. Thread-local: each libtest thread gets its own. When unset it falls
/// back to real wall-clock time (mirroring JS `Date.now()`), unlike
/// `runtime::call_closure_mock` (which panics — a missing mock there is a
/// test bug; here the real default is the production behavior).
#[cfg(not(target_arch = "wasm32"))]
pub mod now_mock {
    use std::cell::Cell;

    pub type Fn = fn() -> f64;

    thread_local! {
        static MOCK: Cell<Option<Fn>> = const { Cell::new(None) };
    }

    pub fn set(f: Option<Fn>) {
        MOCK.with(|m| m.set(f));
    }

    pub(crate) fn call() -> f64 {
        match MOCK.with(|m| m.get()) {
            Some(f) => f(),
            None => real_now(),
        }
    }

    /// Milliseconds since the Unix epoch, as f64 (JS `Date.now()`).
    fn real_now() -> f64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as f64)
            .unwrap_or_default()
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn host_now() -> f64 {
    now_mock::call()
}

// ---------------------------------------------------------------------------
// Armed state
// ---------------------------------------------------------------------------

/// Armed soft timeout: `(deadline_epoch_ms, limit_ms)`; `None` = unarmed.
thread_local! {
    static SOFT_TIMEOUT: Cell<Option<(f64, i64)>> = const { Cell::new(None) };
}

/// Arm the soft timeout (ABI `nova_rt.set_soft_timeout`); JS computes
/// `Date.now() + ms` at evaluation start. `runtime::reset` disarms.
pub(crate) fn arm(deadline_epoch_ms: f64, limit_ms: i64) {
    SOFT_TIMEOUT.with(|c| c.set(Some((deadline_epoch_ms, limit_ms))));
}

/// Disarm — called by `runtime::reset` (plan §3.9: `reset()` disarms).
pub(crate) fn disarm() {
    SOFT_TIMEOUT.with(|c| c.set(None));
}

/// The checkpoint (ABI `nova_rt.__checkpoint`): 0 = continue; non-zero = an
/// ERROR handle the call site returns as its own value. Fires only when
/// armed AND strictly past the deadline (naive: `duration > timeout.ms`);
/// a deadline that passes during checkpoint-silent work (e.g. a long
/// builtin-internal loop) fires on the next checkpoint afterwards — exactly
/// naive's semantics, because checkpoints only exist at call sites.
pub(crate) fn checkpoint_impl() -> u64 {
    let Some((deadline_epoch_ms, limit_ms)) = SOFT_TIMEOUT.with(Cell::get) else {
        return 0;
    };
    if host_now() <= deadline_epoch_ms {
        return 0;
    }
    errors::restriction_exceeded_soft_timeout(limit_ms)
}
