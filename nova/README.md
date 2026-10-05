# dicexp-nova

`nova` is the compiler-based implementation of [dicexp](../README.md): it
compiles dicexp expressions to WASM and evaluates them in a WASM runtime,
aiming to be much faster than the tree-walking `naive` evaluator while
remaining the new de-facto semantic standard of the language.

- Docs: [`docs/plan.md`](./docs/plan.md) (architecture & ABI),
  [`docs/compat.md`](./docs/compat.md) (divergences from naive),
  [`docs/roadmap.md`](./docs/roadmap.md) (path to 1.0 and beyond).
- Layout: `crates/` (Rust, cargo workspace — `dicexp-nova-*` on crates.io),
  `packages/` (npm — `@dicexp/nova*`).

## Build

Prerequisites: Rust (with `rustup target add wasm32-unknown-unknown`), plus
the repo-level prerequisites (just, Node.js, pnpm).

```sh
just build-nova        # cargo build both crates to wasm32, stage .wasm assets
just build-nova-ts     # build the TS wrapper
just test-nova         # run nova tests
```
