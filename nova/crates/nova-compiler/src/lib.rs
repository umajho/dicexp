//! The dicexp-nova compiler: dicexp source in, WASM bytes out.
//!
//! See `nova/docs/plan.md` §5 (parser) and §4 (compilation model).
//!
//! Pipeline: `to_half_width` → [`lexer`] → [`parser`] → [`check`]
//! (collect-all semantic checks) → [`codegen`] (WASM emission).
//!
//! Native entry points: [`compile_source`] / [`parse_source`]. The cdylib
//! JS-facing API (`__reset`/`__alloc`/`compile`/result buffers) lives in
//! `api` (wasm32-only: its pointers are linear-memory `i32`s) and is a thin
//! wrapper over [`compile_source`].

#[cfg(target_arch = "wasm32")]
pub mod api;
pub mod ast;
pub mod check;
mod codegen;
pub mod error;
mod layout;
mod lexer;
mod parser;

pub use error::{CompileError, ErrParam};

/// What [`compile_source`] returns on success.
pub struct CompileOk {
    /// The emitted program module (plan §3.4).
    pub wasm_bytes: Vec<u8>,
    /// Number of funcref table slots the program populates (slots 0..N).
    pub table_size: u32,
}

/// Parse only (half-width normalization included). Errors are parse errors.
pub fn parse_source(src: &str) -> Result<ast::Node, Vec<CompileError>> {
    let converted = lexer::to_half_width(src);
    parser::parse(&converted)
}

/// Full pipeline. On failure, returns all collected errors (parse errors
/// abort at the first one; semantic errors are collected exhaustively).
pub fn compile_source(src: &str) -> Result<CompileOk, Vec<CompileError>> {
    let node = parse_source(src)?;
    let errors = check::check(&node);
    if !errors.is_empty() {
        return Err(errors);
    }
    match codegen::emit(&node) {
        Ok(res) => Ok(CompileOk { wasm_bytes: res.wasm_bytes, table_size: res.table_size }),
        // Internal codegen failure (a compiler bug; unreachable for programs
        // that passed the checks, but no panics on wasm paths).
        Err(msg) => Err(vec![CompileError::with_str(
            dicexp_nova_abi::error_key::PARSE_SYNTAX_ERROR,
            (0, 0),
            format!("internal: {msg}"),
        )]),
    }
}
