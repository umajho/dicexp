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

## 2026-10-08 — after v0.7 (builtin completeness, DONE)

### Where we are

- Branch `nova`, ~77 local commits ahead of `main`, nothing pushed. v0.7
  done: 25 new builtins in BOTH impls (contracts: `docs/v0.7-contracts.md`
  — semantics were new in both, so DEFINED there, not probed), comparison
  ops accept booleans in both, `if/*` deferred by the owner (lands with
  statements/Elixir sugars), range operators (#8) deferred to their own
  milestone. Session tag: `agents/sessions/nova/nova-v0.7`.
- Numbers: nova 1364 JS (+2 skipped sleep rows, 3 todo — `if/3` Y-comb +
  two `d` todos, unchanged) + 178 Rust; naive 208 / 62+4todo / 408.
  Differential 664; fuzz ~8 seeds × 10k × 3 green. Bench: worst row `d6`
  1.81× (unchanged — no regression from the runtime-path edits). Sizes:
  builtins 45,500/50,000 B raw (**only ~4.5 KB headroom left** — v0.9's
  trace hooks must be measured when they land), compiler 114,884/120,000 B.
- ABI: ids 36–60 + error keys 50–52 added; `ABI_VERSION` stays 2 —
  additive-append discipline now recorded in plan §3.5.

### v0.7 mechanics the next lead should know

- **naive's closure `_call` forces the body at call time**
  (`createValueBoxOfIndirectErrorIfErrorIsFromArgument`'s `.get()` in
  `values_impl.ts` — error-indirection bookkeeping). Invisible until
  `foldr` became the first builtin to defer closure results; fixed
  surgically in naive's foldr (each `callCallable` wrapped in
  `createValueBox.lazy`). The quirk is LEFT in place globally — any
  future builtin that defers a closure result must wrap the same way.
  Contract pins foldr body order: outer-in.
- Simulated-if idiom without `if/*`: `head(append(filter([t], |_| cond),
  f))` — NO trailing `.()` unless the branches are closures (plain values
  aren't callable; compat #6). unfold/iterate contracts cope with this.
- nova side: `SENTINEL_FOLDR_FNIDX` thunk arm in `force_impl` (env holds
  [callable, elem, acc]); sequence sources iterate/unfold/drop reuse the
  transformer extra-field region; `seq::pull` is `pub(crate)` for `take`.
- `sort/2` is a hand-rolled stable merge sort in BOTH impls (V8 TimSort
  isn't stable for boolean ≤ comparators; Rust `sort_by` over a raw slice
  is UB against the reallocating emulated heap). Comparators must be
  pure — comparison order/count differs per impl by design.
- The fuzzer's `renderProgram` had a pre-existing off-by-one dropping the
  outermost pipe-chain call (~55% of multi-spine programs rendered
  simpler than their ASTs) — v0.5's 180k-program exit runs were narrower
  than intended (agreement unaffected). Fixed; current runs are full
  strength. It also found the foldr bug — the fuzzer earns its keep.

### Integration gotchas (cost real time this iteration)

- **Provider quota deaths mid-iteration**: GLM quota died twice (5-hr
  limits). Workers' disjoint file scopes meant partial states were
  coherent (`git status` + a cheap targeted test run assesses them);
  resume nudges on the session work. Owner's rules now explicit: pause
  and ask before spawning NEW subagents; don't retry/escalate rate-limited
  ones; the owner may switch a session's model manually — a resume may
  need an explicit `model` (this session used `zai-coding-plan/glm-5.3`).
- **Bench lock hang**: a hard-killed bench leaves `bench/results/.lock`;
  the old acquire loop spun silently for 30 min. Now pid-based
  self-healing (10 s stale grace for pid-less dirs, 10-min live cap).
  If a bench run ever produces zero output: check `.lock` first.
- Salvaged from v0.5: a hard V8 OOM during fuzzing (no divergence report)
  bisects cheaply via `FUZZ_PROGRAMS` on the deterministic stream; and
  worker-init changes can be verified WITHOUT a browser via an
  integration-sim (real manager + fake worker), the browser smoke then
  confirms the real path.

### Open nuances for the owner (carried + new)

- Carried: worker handshake (`loaded`/`initialize`) has no timeout;
  naive's `statistics.calls` under softTimeout not reproduced; playground
  selector persistence deliberately absent; `if/3` Y-combinator row stays
  todo until `if/*` lands (owner: with statements/sugars).
- New offers (owner's calls, recorded in v0.7-contracts.md): making
  naive's `any?/1`/`all?/1` short-circuit would retire div1 entirely;
  sequence-accepting `takeWhile`/`dropWhile`; `has?/2`'s strict-scalar
  rule and `min`/`max` int-only were coin-flip decisions (flagged);
  `flattenAll` name not final per #18. Owner TODO reminder: regenerate
  #18's tables as an updated markdown (owner asked to be reminded).

## 2026-10-06 — after v0.6 (performance & size, DONE)

### Where we are

- v0.6 done: CI-style bench suite, program-instance reuse, const-pool
  hoisting (plan §3.4), wasm-opt + size budget, checkpoint-guard overhead
  measured. Static linking deferred (v1.1+). Numbers/tables:
  `docs/benchmarks.md` + `docs/size-budget.md` (v0.7's regression check
  there confirms no drift).

### v0.6 mechanics the next lead should know

- **Bench suite**: `cd nova/packages/nova && pnpm run bench` (separate
  vitest dir, never in `pnpm test`). Knobs: `BENCH_SCALE`, `BENCH_ONLY`
  (label substring), `NOVA_COMPILER_WASM_PATH`/`NOVA_BUILTINS_WASM_PATH`
  (asset swaps — how checkpoint/const-pool isolation was measured).
  Results: gitignored `bench/results/latest.{json,md}`; pid-based lock.
  Compiler-swap isolation needs a **worktree build of the old commit**
  (`git worktree add … <rev>`, cargo build, wasm-opt same flags) — old
  compilers link fine against current builtins (ABI unchanged).
- `just build-nova-wasm-nockpt` = measurement-only guardless compiler
  (`--no-default-features`; soft timeout silently dies — never ship it);
  `just nova-wasm-sizes` = raw/gzip/brotli table.
- Instance-reuse invariants graduated to plan §7 + `machine.ts` comments;
  the const-pool list-immutability audit is in `codegen.rs` comments.

### Integration gotchas (cost real time this iteration)

- **Parallel subagents share ONE working tree.** Disjoint file scopes,
  but a full-scale bench run picks up whatever other workstreams already
  landed — WS1's first "baseline" silently included WS2's reuse. Working
  procedure: workers never commit → lead sets other workstreams' diffs
  aside (save patch, `git checkout --`, move untracked), measures the
  true baseline, restores, commits per workstream.
- **Timing pollution**: never run cargo/vite/another vitest while a bench
  runs. "All design/edits first, CPU-heavy verification last" worked.
- Bench run-to-run variance ≈ ±5% (±10% const-pool workload): attribute
  improvements only above that bar.
- **Profile before optimizing — both the lead's and the owner's
  hypotheses were wrong** (crossings, checkpoint guard suspected; the
  culprit was RNG seeding at 85% of trivial samples). Lesson: on "X is
  slow", first decompose ns/sample (reset/seed/__main/finalize/decode/
  glue — the scratch-probe pattern, 200k tight loops, best-of-3, `42` as
  the zero-work control); details in benchmarks.md "Second round". Also:
  `#[inline]` is ignored at opt-level="z" — use `#[inline(always)]` for
  hot WASM helpers.

### Open nuances for the owner (carried + new)

- Checkpoint guard ≈4% on call-dense programs — recorded in
  benchmarks.md; revisit if fuel/chunked-ops (issue #3) adds checkpoint
  work. Semantics unchanged.
- Const-pool extension candidates deferred: hoisting beyond pure-literal
  lists (constant closures?), finer capture sets.

### Environment notes

- `wasm-opt` = npm `binaryen@^132` (`pnpm exec wasm-opt`); both flag
  sets need `--enable-bulk-memory-opt` (rustc output lacks a
  target-features section). `-Oz --converge` buys 129 B over `-Oz` —
  not worth it.
- `Machine` is NOT on `@dicexp/nova`'s public surface; the bench's
  overhead split imports `../src/machine` directly (comment there).


