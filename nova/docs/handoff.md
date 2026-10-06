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

## 2026-10-06 — after v0.5 (limits & robustness, DONE)

### Where we are

- Branch `nova`, ~55 local commits ahead of `main`, nothing pushed. **v0.5
  is done** (all exit criteria met): checkpoint channel + soft timeout
  (plan §3.9, `ABI_VERSION = 2` — `machine.ts` now guards it); TCO verified
  by a substituted row; differential fuzzing v1 landed; the nova-in-worker
  init-failure gap fixed (bounded retry + surfaced error).
- Numbers: 129 Rust + 753 nova JS tests (2 skipped = sleep/1 rows; 3 todo:
  the `if/3` Y-combinator + two `d` todos) + naive 208 / 62+4todo / 158;
  playground tsc + vite build clean. Browser smoke: soft timeout fires
  under nova with naive's exact message; init failure (hidden wasm assets)
  shows a real error card after ~6 s of retries; recovery confirmed.
- Fuzz: `FUZZ_SEED`/`FUZZ_PROGRAMS` env knobs; default 1000 programs ≈
  0.3 s; 10k ≈ 2.7 s per seed. Exit run: 180k programs × 3 eval seeds
  (incl. one 100k stress run), zero unexplained divergences. Repro triple:
  (FUZZ_SEED, FUZZ_PROGRAMS, program index).

### Integration gotchas (cost real time this iteration)

- **naive cannot build large flat repetition-lists** (`300000#1 |> sum` →
  uncaught RangeError from spread-based list construction, ~10–60k cap) —
  now compat #9. Any future both-impl test row needing big collections must
  use per-impl shapes (the soft-timeout busy rows do, via `forImpl`).
- **A simulated-if with trailing `.()` defeats nova's trampoline** (branch
  forced nested inside the value call); without it the chain is a thunk
  chain chased by the iterative force loop. Lazy accumulators must be
  forced per level. All in compat #6.
- naive's failure on list-carrying self-recursion is an **uncatchable
  fatal OOM**, not a RangeError — a live naive row would kill the vitest
  worker process. Keep such shapes `todoFor: ["naive"]` (compat #6).
- Soft-timeout rows are wall-clock: keep margins ≥5× (nova busy row
  `300000#1 |> sum` ≈ 55–70 ms vs the 10 ms deadline).
- Fuzz-triage lesson: NaN silently bypasses every comparison-based guard —
  the generator's `genPredicate` now has an explicit `!(total > 0)` guard.
  A hard V8 OOM (no divergence report) bisects cheaply via FUZZ_PROGRAMS on
  the deterministic stream.

### Subagent playbooks

- Contract-first parallelization worked again: lead wrote the checkpoint
  ABI (nova-abi + plan §3.9), then three `x-smart` agents in parallel
  (mechanism / worker-init fix / fuzzer), one follow-up for suite rows. No
  escalation needed.
- **Resume-session BROKE this iteration**: the subagent sessionID was
  truncated to `"ses"` in transit on every attempt (harness bug?). A fresh
  session with a self-contained prompt worked fine — write prompts
  self-contained, treat resume as opportunistic.
- Integration-sim (real manager + fake worker, 33 checks) verified the
  init-failure fix without browser driving; the browser smoke then
  confirmed the real 404 path end-to-end (hidden wasm assets → vite serves
  an HTML error page → `WebAssembly.compile` magic-word error).

### Open nuances for the owner

- `statistics.calls` (naive's call counting under softTimeout) not
  reproduced — deferred, no known consumer (compat TODO).
- Known adjacent gap (deliberately left): the worker handshake
  (`loaded`/`initialize`) has no timeout — a worker *script* 404 still
  hangs init forever; only failures inside `initialize` (e.g. wasm fetch)
  are covered. Needs a handshake-timeout policy decision.
- When `if/*` lands (v0.7): drop nova from the `if/3` Y-combinator row's
  `todoFor`; the substitute TCO row may stay or go.

### Environment notes

- Dev server: if the shell tool's `background` parameter doesn't take
  (happened repeatedly this session), `nohup npx vite --port 5199
  --strictPort > …/vite.log 2>&1 &` works; kill by port as usual.
- `just test-nova` rebuilds the wasm assets first; the ABI guard in
  `machine.ts` turns stale-asset mistakes into a clear error.

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
  (undefined for nova ⇒ only the sleep/1 rows skip). 99 parse rows are
  `div3` (nova rejects unknown names at compile time — asserted as parse
  errors).
- **Verify "naive errors/behaves-X" assumptions empirically BEFORE writing
  them into contracts/compat** — compat #4 had to be withdrawn; the lead's
  contract also used `|_x|` (parse error; the ignored-param form is `|_|`).
- Carried from v0.2 (section pruned): playground type-check hermeticity —
  `rm -rf` naive dists if red at HEAD; worker manager/client/sampling have
  no package-level tests (verify via playground integration + browser
  smoke); `evaluatorInfo` in `@dicexp/nova` hardcodes the version.

### Subagent playbooks

- `x-*` tiers per updated AGENTS.md: `x-smart` ×2 (GLM 5.3; Rust
  transformers + any?; suite extraction two phases), `x-flash-capable` ×1
  (GLM 5.3 Flash; differential + preset empirical pinning). No escalation
  needed.
- **Resume-session for multi-phase work**: phase 2 ran in the same session
  that had written the suite API — warm context, zero re-explanation.
- **Scratch-probe pattern**: the differential agent used self-headed
  `scratch-probeN.test.ts` files, deleted at the end. Expect a red full
  suite while a probe workstream is mid-flight — check for scratch files
  before panicking.
- Contracts that survived contact: exact bookkeeping pseudocode + "verify
  every row empirically before pinning" (caught the contract's own errors).

### Open nuances for the owner (carried + new)

- Carried: playground selector persistence (still not, deliberate);
  benchmark panel shows a speedup on cancelled runs.

### Environment notes

- Still no `wasm-opt`/`wasmtime` (v0.6 concern; npm `binaryen` ships
  wasm-opt if needed earlier).
- Model routing: pass the `x-*` tier name as `agent` (AGENTS.md §Delegation);
  `explore`/`general` are not ladder tiers and must not be spawned. Look up
  model IDs with the models tool when needed (e.g. `opencode-go/glm-5.3`) —
  never guess.

