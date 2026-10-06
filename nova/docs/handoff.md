# nova — Lead's handoff notebook

> Tacit knowledge for the next session/iteration that doesn't belong in the
> architecture docs. **Read this after** `AGENTS.md`, before
> `docs/roadmap.md` / `docs/plan.md` / `docs/compat.md`.
>
> **Lifecycle (per AGENTS.md §Handoff):** this is a *rolling* notebook, not
> an archive. New dated sections go on top; keep at most current + previous
> sections (prune the rest); durable knowledge graduates to the proper docs
> opportunistically — significant entries may persist across iterations
> while useful (the size cap, not a timer, is the forcing function); delete
> obsolete entries outright; keep the whole file ≤ ~150 lines.

## 2026-10-06 — after v0.4 (language-complete core, DONE)

### Where we are

- Branch `nova`, ~47 local commits ahead of `main`, nothing pushed. **v0.4
  is done** (all exit criteria met): `reroll`/`explode` implemented as a new
  transformer sequence source (naive's debt-counter bookkeeping replicated
  exactly; display-only decorations dropped — v0.9 concern);
  `UNIMPLEMENTED` (key 41) gone from abi/builtins/zh locale; `any?/1`
  short-circuits element forcing (compat #1, per #13's comment; `all?`
  mirrors in v0.7). Shared-suite extraction landed: naive's four semantic
  tables live in `internal/test-utils-for-executing/suites/` with
  divergence tags mirroring compat.md; **the full 429-row naive corpus runs
  on nova: 423 passed | 3 skipped (soft-timeout, v0.5) | 3 todo — zero
  untagged failures.** compat #4 (`sum([])`/`product([])`) WITHDRAWN —
  naive already returned 0/1.
- Numbers: 121 Rust + 733 JS tests (differential 146→221; +shared-suites
  429) + naive 208/60+3todo/158; playground tsc + `vite build` green.
  Browser smoke: nova `explode` single-roll OK; reroll preset 10000
  samples, 3.27× speedup, histograms identical.
- Benchmark presets: 11 total, all agree seeds 0–19 (0–50 for the three
  reworked). The old `any?` preset was replaced with a `map`-pre-forced
  form — the agreement rule is now in the presets file header: **no raw
  `any?`/`all?` over `#`-lists** (short-circuit shifts RNG; compat #1).

### Integration gotchas (cost real time this iteration)

- **`a~b` is a uniform die draw per pull** (an infinite stream like `d`),
  NOT a static range — misled the lead's first semantics contract.
  Now pinned in compat "Behavior preserved" + differential tests.
- Chained-transformer edge: after a terminal error the stream is ENDED
  (naive's null-yield), so `3#d6 |> explode(|$x| 5) |> reroll(...)` → `[]`.
  nova models a stream-level `Ended`; pinned in differential.
- naive CRASHES (uncaught `ReferenceError: name is not defined`, l10n bug)
  when a bad-closure `sequence$sum` reroll/explode result is summed —
  carve-out `DIVERGENT_NAIVE_CRASHES` pins naive's throw vs nova's clean
  key-48. The LIST path (`|> at(0)`) is exact-message parity instead.
- Transformer never touches `rng` directly; extra rolls = pulling the
  source PAST nominal — dice/repeat/range arms must support beyond-nominal
  pulls (they already did; transformers rely on it).
- Shared-suite mechanics: nova's `parse` = a classification over
  `evaluate()` (`["error","parse"]` vs not); scope injection can't be
  shared — `SuiteContext.makeTesterFor`/`makeSleepTester` parameterize it
  (undefined for nova ⇒ soft-timeout block skips). 99 parse rows are
  `div3` (nova rejects unknown names at compile time — asserted as parse
  errors). vitest `skipIf` chained-only — graduated to plan §9.1; the
  browser smoke playbook graduated to the `browser-debugging` skill
  (`.agents/skills/`).
- **Verify "naive errors/behaves-X" assumptions empirically BEFORE writing
  them into contracts/compat** — compat #4 had to be withdrawn; the lead's
  contract also used `|_x|` (parse error; the ignored-param form is `|_|`).
- Carried from v0.2 (section pruned): playground type-check hermeticity —
  `rm -rf` naive dists if red at HEAD; worker manager/client/sampling have
  no package-level tests (verify via playground integration + browser
  smoke); `evaluatorInfo` in `@dicexp/nova` hardcodes the version.

### Subagent playbooks

- Tier-named agents per updated AGENTS.md: `smart` ×2 (Rust transformers +
  any?; suite extraction two phases), `solid-smarter` ×1 (differential +
  preset empirical pinning). No escalation needed.
- **Resume-session for multi-phase work**: phase 2 ran in the same session
  that had written the suite API — warm context, zero re-explanation.
- **Scratch-probe pattern**: the differential agent used self-headed
  `scratch-probeN.test.ts` files, deleted at the end. Expect a red full
  suite while a probe workstream is mid-flight — check for scratch files
  before panicking.
- Contracts that survived contact: exact bookkeeping pseudocode + "verify
  every row empirically before pinning" (caught the contract's own errors).

### Open nuances for the owner (carried + new)

- Y-combinator `it.todo` uses `if/3` — unrunnable on BOTH impls until
  v0.7's `if/*`; body pre-filled, drop nova from `todoFor` then.
  Observation: non-tail recursion at depth 1000 overflows BOTH impls
  (naive RangeError; nova "Maximum call stack size exceeded") — v0.5's
  TCO scope is tail chains, so this is expected.
- v0.5 soft-timeout: naive's rows need host-injected `sleep/1` —
  impossible for nova; new nova-side rows needed when checkpoints land.
- Carried: playground selector persistence (still not, deliberate);
  benchmark panel shows a speedup on cancelled runs; nova-in-worker
  init-failure gap (forever spinner if wasm fetch fails) — v0.5.

### Environment notes

- Still no `wasm-opt`/`wasmtime` (v0.6 concern; npm `binaryen` ships
  wasm-opt if needed earlier).
- Model routing: pass the tier name as `agent` (AGENTS.md §Delegation);
  `general`/`explore` default to KIMI K3 here. Look up model IDs with the
  models tool when needed (e.g. `opencode-go/glm-5.3`) — never guess.

## 2026-10-06 — after v0.3 (playground benchmark mode, code-complete)

### Where we are

- v0.3 **code-complete** (deploy is the owner's call, same as v0.2):
  benchmark mode is a third tab (基准) alongside 单次/抽样 in the control
  pane; the naive/nova selector and the example select hide in benchmark
  mode; the benchmark editor keeps its OWN doc signal — presets must not
  clobber the autosaved main doc. Completed/cancelled runs push a
  keepable/removable 基准 record card into the result pane (shared
  `BenchmarkOutcomeView`; Benchmark* types in `types.ts`).
  Numbers: `nova/docs/benchmarks.md` — nova 0.52× naive on `d6`
  (instantiation-dominated), 3.4–12.8× faster on evaluation-heavy presets,
  **zero histogram disagreements** across all 9 presets. v0.6's
  static-linking question is resolved by them (stays deferred; instance
  reuse is the first perf lever).
- Protocol option: `I.RemoteSamplingOptions { sampling?: { maxSamples } }`
  (interface + both worker packages) — worker stops after exactly N
  samples (seeds 0..N−1), making runs exactly comparable.

### Integration gotchas (still relevant)

- **Sampling channel semantics** (pinned in dicexp-benchmark.ts's header):
  `keepSampling`'s async generator yields `["continue", …]` interval
  reports; the FINAL stop/error report is the generator's *return* value.
  Histograms are integer-only — non-number results error the run (this is
  why presets are integer-valued).
- Commit `3cbd5f9` (BOTH worker packages — pre-existing naive bug): the
  sampling handler fell through after the generator's terminal error and
  overwrote it with a bogus `抽样不支持求值结果 "runtime" 的类型` message.
  If sampling ever shows a wrong/confusing error again, suspect the
  handler first.
- zsh: `echo ===` is a parse error (`=cmd` expansion); commit messages
  with apostrophes/quotes — write to a temp file and `git commit -F`.

### Subagent playbooks (from v0.3, still true)

- Contract-first parallelization: lead writes the shared API/types files,
  then impl and consumer agents work in parallel against them.
- smart agent's **bonus integration-sim** pattern: bundle the real hook
  with faithful fakes of the client in a scratch dir, drive scenarios —
  much cheaper than browser driving for logic verification.
- Scratch differential verification of playground presets = temp vitest in
  `nova/packages/nova/test/` importing
  `../../../../playground/src/stores/benchmark-presets`. Delete after.
