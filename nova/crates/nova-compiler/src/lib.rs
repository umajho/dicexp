//! The dicexp-nova compiler: dicexp source in, WASM bytes out.
//!
//! See `nova/docs/plan.md` §5 (parser) and §4 (compilation model).

// TODO(compiler): parser, purity analysis, codegen, WASM emission, and the
// cdylib JS-facing API (`__reset`/`__alloc`/`compile` + result buffers).
