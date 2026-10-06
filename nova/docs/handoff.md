# nova — Lead's handoff notebook

> Tacit knowledge for the next session/iteration that doesn't belong in the
> architecture docs. **Read this after** `AGENTS.md`, before
> `docs/roadmap.md` / `docs/plan.md` / `docs/compat.md`.
>
> **Lifecycle (per AGENTS.md §Handoff):** this is a *rolling* notebook, not
> an archive. New dated sections go on top; keep at most current + previous
> sections (prune the rest); durable knowledge graduates to the proper
> place opportunistically — docs (`plan.md` / `compat.md` / `roadmap.md` /
> `AGENTS.md`), code comments, or `.agents/skills/` for reusable
> playbooks — significant entries may persist across iterations
> while useful (the size cap, not a timer, is the forcing function); delete
> obsolete entries outright; keep the whole file ≤ ~150 lines.

## 2026-10-06 — after v0.6 (performance & size, DONE)

### Where we are

- Branch `nova`, ~65 local commits ahead of `main`, nothing pushed. **v0.6
  is done** (exit criteria met): CI-style bench suite, program-instance
  reuse, const-pool hoisting (plan §3.4 implemented), wasm-opt + size
  budget, checkpoint-guard overhead measured. Static linking stays
  deferred (v1.1+).
- Numbers: 135 Rust + 758 nova JS tests (2 skipped = sleep rows; 3 todo:
  `if/3` Y-combinator + two `d` todos; +5 instance-reuse tests this
  milestone). Bench suite: 14 tests (~77 s at `BENCH_SCALE=1`). Fuzz:
  10k programs × 3 seeds green post-const-pool. Playground tsc + `vite
  build` clean; browser smoke: nova single-roll OK, sampling ~430k
  samples/s on `d6`.
- Headline perf (Node v24.7.0, tables + attribution in
  `docs/benchmarks.md`): **every bench row beats naive** (worst row `d6`
  1.81× = 996k samples/s; heavy rows 1.8–15.0×; ≥10× target met on the two
  heaviest). Checkpoint guard ≈4% on call-dense recursion, 12 ns (≤0.5%)
  on `d6`. Sizes (`docs/size-budget.md`): compiler 113,688 B raw /
  35.3 KB brotli (budget ≤ 120 KB raw, adjusted), builtins 36,746 B /
  13.8 KB brotli (≤ 50 KB met).

### v0.6 mechanics the next lead should know

- **Bench suite**: `cd nova/packages/nova && pnpm run bench` (separate
  vitest dir, never in `pnpm test`). Knobs: `BENCH_SCALE`, `BENCH_ONLY`
  (label substring), `NOVA_COMPILER_WASM_PATH`/`NOVA_BUILTINS_WASM_PATH`
  (asset swaps — how checkpoint/const-pool isolation was measured).
  Results: gitignored `bench/results/latest.{json,md}`. Cross-file
  mkdir lock serializes the two files. Compiler-swap isolation needs a
  **worktree build of the old commit** (`git worktree add … <rev>`,
  cargo build, wasm-opt with the same flags) — old compilers link fine
  against current builtins (ABI unchanged).
- `just build-nova-wasm-nockpt` = measurement-only guardless compiler
  (`--no-default-features`; soft timeout silently dies — never ship it).
- `just nova-wasm-sizes` = raw/gzip/brotli table.
- Instance reuse invariants graduated to plan §7 + `machine.ts` comments
  (`tableEpoch` re-binding; const-pool prologue re-init per `__main` run).
  The list-immutability audit (const-pool safety) is in `codegen.rs`
  comments: every `list_set` site writes into a freshly allocated list.

### Integration gotchas (cost real time this iteration)

- **Parallel subagents share ONE working tree.** Their file scopes were
  disjoint, but a full-scale bench run picks up whatever other
  workstreams already landed — WS1's first "baseline" run silently
  included WS2's reuse. Procedure that worked: workers never commit →
  lead sets other workstreams' diffs aside (save patch, `git checkout
  --`, move untracked files), measures the true baseline, restores,
  commits per workstream.
- **Timing pollution**: never run cargo/vite/another vitest while a
  bench runs. WS3 was instructed "all design/edits first, CPU-heavy
  verification last" and it worked.
- **Subagents can end their turn mid-work** (WS4 did, twice: "waiting
  for X to complete"). Resume WORKED this iteration (unlike v0.5's
  truncation bug) — a plain "continue + report" nudge sufficed. Treat
  a completed-without-report notification as "nudge it", not "done".
- Bench run-to-run variance ≈ ±5% (±10% on the const-pool workload):
  attribute improvements only above that bar; the const-pool's +10.3%
  needed the isolated compiler swap to be believable.
- **Profile before optimizing — both the lead's and the owner's hypotheses
  were wrong.** The last trivial-program gap (`d6` 0.67×) survived reuse;
  crossings (≈1 ns each) and the checkpoint guard (12 ns/sample) were the
  prime suspects, but a ns/sample decomposition pinned **`builtins.seed()`
  at ~85% of every trivial sample** (per-step `Cell` copies + TLS calls
  ×256 — 3.6× slower than naive's identical algorithm in JS). Fixed to
  506 ns (locals + shared `step_v`; stream bit-identical) → all rows
  ≥1.8×. Lesson: on "X is slow", first decompose ns/sample (reset / seed
  / __main / finalize / decode / glue — the scratch-probe pattern,
  200k-iteration tight loops, best-of-3, `42` as the zero-work control).
  Also: `#[inline]` is ignored at opt-level="z" — use `#[inline(always)]`
  for hot WASM helpers.

### Open nuances for the owner (carried + new)

- Carried: worker handshake (`loaded`/`initialize`) has no timeout
  (worker-script 404 hangs init); naive's `statistics.calls` under
  softTimeout not reproduced; when `if/*` lands (v0.7), drop nova from
  the original Y-combinator row's `todoFor`; playground selector
  persistence deliberately absent.
- Checkpoint guard ≈4% on call-dense programs — recorded in
  benchmarks.md; if fuel/chunked-ops (issue #3) later adds checkpoint
  work, revisit then. Semantics unchanged.
- Const-pool extension candidates deferred: hoisting beyond pure-literal
  lists (constant closures?), finer capture sets. Compiler budget
  (≤ 120 KB raw) leaves ~6 KB headroom — watch v0.7's new builtins.

### Environment notes

- `wasm-opt` = npm `binaryen@^132` (`pnpm exec wasm-opt`); both flag
  sets need `--enable-bulk-memory-opt` (rustc output lacks a
  target-features section). `-Oz --converge` buys 129 B over `-Oz` —
  not worth it.
- `Machine` is NOT on `@dicexp/nova`'s public surface; the bench's
  overhead split imports `../src/machine` directly (comment there).

## 2026-10-06 — after v0.5 (limits & robustness, DONE)

### Where we are

- v0.5 done: checkpoint channel + soft timeout (plan §3.9, `ABI_VERSION =
  2` — `machine.ts` guards it); TCO verified by a substituted row;
  differential fuzzing v1; nova-in-worker init-failure gap fixed (bounded
  retry + surfaced error).
- Fuzz: `FUZZ_SEED`/`FUZZ_PROGRAMS` env knobs; default 1000 programs ≈
  0.3 s; 10k ≈ 2.7 s per seed. Exit run: 180k programs × 3 eval seeds,
  zero unexplained divergences. Repro triple: (FUZZ_SEED, FUZZ_PROGRAMS,
  program index).

### Integration gotchas (still relevant; the rest graduated to compat.md)

- **Per-impl test shapes for big collections** (compat #9): naive cannot
  build large flat repetition-lists (~10–60k spread RangeError), and dies
  UNCATCHABLY on list-carrying deep recursion (compat #6 — a live naive
  row would kill the vitest worker; keep `todoFor: ["naive"]`). Both-impl
  rows needing such shapes use per-impl forms (see the soft-timeout busy
  rows' `forImpl`). Applies to benchmark workload design too.
- Soft-timeout rows are wall-clock: keep margins ≥5×.
- Fuzz-triage: NaN silently bypasses comparison-based guards (generator
  now guards `!(total > 0)`); a hard V8 OOM (no divergence report)
  bisects cheaply via FUZZ_PROGRAMS on the deterministic stream.
- Worker-init fixes can be verified WITHOUT a browser via an
  integration-sim (real manager + fake worker); the browser smoke then
  confirms the real path end-to-end.

### Environment notes

- Dev server: if the shell tool's `background` parameter doesn't take,
  `nohup npx vite --port 5199 --strictPort > …/vite.log 2>&1 &` works;
  kill by port as usual.
- `just test-nova` rebuilds the wasm assets first; the ABI guard in
  `machine.ts` turns stale-asset mistakes into a clear error.


