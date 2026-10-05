//! The dicexp-nova builtins library and runtime, precompiled to WASM.
//!
//! See `nova/docs/plan.md` §3 (ABI), §4 (semantics model) and §6 (builtins).
//!
//! Modules:
//! - [`mem`]: emulated linear memory + bump allocator (offsets ↔ pointers;
//!   on wasm, offsets ARE linear-memory pointers). Owns the permanent zone
//!   (preallocated OOM error, emergency result region, args buffer, sink).
//! - [`values`]: heap object layouts/constructors/accessors per ABI §3.1.
//!   Constructors are total: allocation failure yields the preallocated
//!   `memoryLimitExceeded` ERROR handle instead of trapping.
//! - [`errors`]: structured error constructors; defines the error keys that
//!   `nova-abi` is missing (upstream candidates; see crate report).
//! - [`rng`]: exact port of naive's xorshift7 + unbiased `integer()`.
//! - [`seq`]: sequence streams (dice-sum, repeat, reroll/explode
//!   transformer; per-position memoized pull-streams) and the implicit casts
//!   (`sequence$sum` → sum, `sequence` → list).
//! - [`runtime`]: ABI runtime exports (`thunk_new`, `force`, `call_callable`,
//!   `repeat`, `reset`, `seed`, …) incl. the iterative force trampoline.
//! - [`builtins`]: all 36 builtins + capture dispatch by ABI id.
//! - [`finalize`]: deep-force + result wire encoding (ABI §3.6).

#[doc(hidden)]
pub mod builtins;
#[doc(hidden)]
pub mod errors;
#[doc(hidden)]
pub mod finalize;
#[doc(hidden)]
pub mod mem;
#[doc(hidden)]
pub mod rng;
#[doc(hidden)]
pub mod runtime;
#[doc(hidden)]
pub mod seq;
#[doc(hidden)]
pub mod values;

#[cfg(not(target_arch = "wasm32"))]
#[doc(hidden)]
pub mod testutil;
