//! The dicexp-nova builtins library and runtime, precompiled to WASM.
//!
//! See `nova/docs/plan.md` §3 (ABI), §4 (semantics model) and §6 (builtins).

// TODO(builtins): heap/bump allocator, values, thunks (iterative force),
// envs, lists, sequences, RNG (exact xorshift7 port), error objects, all
// builtin implementations, and the exported ABI functions.
