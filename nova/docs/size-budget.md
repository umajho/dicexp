# nova wasm size budget (v0.6)

Measured 2026-10-06. Reproduce with `just build-nova-wasm && just nova-wasm-sizes`.

- Tools: `wasm-opt` version 132 (version_132), from the npm `binaryen@^132.0.0`
  devDependency (invoked as `pnpm exec wasm-opt`; no system install).
  rustc 1.97.1 (8bab26f4f 2026-07-14).
- **v0.6 initial targets** (raw bytes, after `wasm-opt`, before brotli):
  compiler ≤ 100 KB, builtins ≤ 50 KB. Adjust to measurements (see status).

## Measured sizes

Raw = bytes on disk in `nova/packages/nova/wasm/`; gzip = level 9; brotli =
max quality (see `nova/scripts/wasm-sizes.mjs`).

**Before `wasm-opt`** (cargo release output: opt-level="z", lto, codegen-units=1,
panic="abort", strip=true):

| asset | raw | gzip (level 9) | brotli (max quality) |
| --- | ---: | ---: | ---: |
| nova-compiler.wasm | 142,277 B | 44,600 B | 35,888 B |
| nova-builtins.wasm | 45,260 B | 17,299 B | 14,825 B |
| nova-shim.wasm | 82 B | 94 B | 77 B |
| **total** | 187,619 B | 61,993 B | 50,790 B |

**After `wasm-opt`** (default flags: compiler `-Oz`, builtins `-O3`; see below):

| asset | raw | gzip (level 9) | brotli (max quality) |
| --- | ---: | ---: | ---: |
| nova-compiler.wasm | 113,688 B | 43,259 B | 35,282 B |
| nova-builtins.wasm | 36,746 B | 16,278 B | 13,824 B |
| nova-shim.wasm | 82 B | 94 B | 77 B |
| **total** | 150,516 B | 59,631 B | 49,183 B |

(The compiler was 108,423 B raw / 33,467 B brotli before the v0.6 const-pool
feature landed; const-pool hoisting + the measurement-only `checkpoints`
feature gate added ~5 KB raw. Builtins unchanged. Compiler −20.1% and
builtins −18.8% raw vs cargo output.)

## Flags chosen

Set at the top of `build-nova-wasm` in the root justfile (`WASM_OPT_*`
variables), tuned per module:

- compiler: `-Oz --enable-bulk-memory-opt` — runs once per program, so size
  is the only metric that matters.
- builtins: `-O3 --enable-bulk-memory-opt` — evaluation hot path (every
  builtin call), so speed over size.
- `--enable-bulk-memory-opt` is **required**, not a tuning knob: rustc emits
  `memory.copy`/`memory.fill` but the modules carry no target-features
  section, so wasm-opt rejects the input without it. (Engines already run
  these modules, so this changes nothing about the deployment envelope.)
- The 82-byte `nova-shim.wasm` (hand-minimized, emitted by
  `dicexp-nova-shim-gen`) is deliberately not run through wasm-opt — already
  minimal, nothing to shrink.

Compiler trial — `-Oz --converge` (also tried, not the default): raw
108,294 B, gzip 41,049 B, brotli 33,432 B. Saves only 129 B raw (0.12%) for
~40% more optimization time (1.8 s → 2.5 s on this module), so plain `-Oz`
stays the default.

## Status vs budget

- builtins: **36,746 B ≤ 50 KB — met.**
- compiler: **113,688 B (110.0 KiB) > 100 KB — the initial target was a
  pre-measurement guess; adjusted to measurements: ≤ 120 KB raw.** The
  deployment-relevant number is brotli 35,282 B (over-the-wire), and further
  shrinking needs source-level work, not more `wasm-opt` flags (`--converge`
  trial below).

## Allocator / codegen review (the other half of the v0.6 size bullet)

- The builtins allocator is a custom bump `#[global_allocator]` over the
  exported linear memory (plan §3.2) — already near-minimal; nothing
  actionable. Builtins at 13.8 KB brotli leaves headroom under budget.
- The compiler's size is dominated by the hand-written parser and the
  `wasm-encoder` dependency; meaningful further shrink would mean paring
  dependencies or codegen structure — poor ROI at 35 KB brotli for a module
  that runs once per program. Revisit only if the budget becomes binding
  (e.g. new dependencies in v0.7+).

Note: playground `vite build` output sizes are the deployment-level view of
these assets; measuring them is out of scope for this doc (the playground
build was not run for these numbers).
