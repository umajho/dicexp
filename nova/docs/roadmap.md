# nova — Roadmap to 1.0 and beyond

> The path from the first working version to `nova` as the default, published,
> step-display-capable implementation of dicexp. Sibling docs:
> [`plan.md`](./plan.md) (architecture & ABI), [`compat.md`](./compat.md)
> (divergences). Each milestone lists **exit criteria**; a milestone is done
> when they hold, not when its tasks are "mostly" complete.

## North star

`nova` becomes the de-facto standard dicexp implementation: faster than
`naive`, small enough for the web, running the playground by default, with
full step display (repr) — and `naive` retires to a selectable
legacy/reference implementation.

## Milestone map

| version | theme | status |
|---------|-------|--------|
| v0.1 | first working version | ✅ done |
| v0.2 | **nova in the playground** | |
| v0.3 | playground benchmark mode | |
| v0.4 | language-complete core | |
| v0.5 | limits & robustness | |
| v0.6 | performance & size | |
| v0.7 | hardening (release candidate) | |
| v1.0 | published default | |
| v1.1 | **repr / step display** | |
| v1.2+ | linking, externals, language growth | |

---

## v0.1 — First working version ✅

Full pipeline (parser → codegen → program.wasm → builtins.wasm) with 36
builtins (`reroll`/`explode` stubbed), exact-RNG seeded differential testing,
230 JS + 110 Rust tests.

## v0.2 — nova in the playground

The user-visible milestone, pulled forward: interacting with nova early is
worth tolerating clearly-labeled stubs (`reroll`/`explode` report
`尚未实现` until v0.4) and the absence of soft timeout (the worker manager's
**hard** timeout — terminate & recreate — is the guard, as it is for naive;
the WASM memory cap is already engine-enforced).

- `@dicexp/nova-in-worker`: mirror `naive-evaluator-in-worker` (worker
  server, manager with heartbeat + hard-timeout terminate/recreate,
  sampling channel); surface the WASM memory cap as the hard memory limit.
- Playground: implementation selector (naive / nova) in the UI; single-roll
  and sampling paths honor the selection; step display shows an explicit
  "steps unavailable under nova" notice instead of the repr tree;
  docs/completion keep consuming naive's static builtin metadata.
- WASM asset strategy for vite (`.wasm` URL assets; instantiation inside the
  worker; async `createEvaluator` path — main-thread sync compile limits do
  not apply in workers, but keep the async API the default anyway).

**Exit:** deployed playground offers both implementations; every interaction
(evaluate, sampling, error display, unavailable-steps notice) works under
both.

## v0.3 — Playground benchmark mode

Users compare the two implementations directly in the playground — and we
get real perf numbers early enough to re-prioritize performance work if
needed.

- New benchmark panel: input expression (plus preset workloads ported from
  `execute.bench.ts`, e.g. Y-combinator, `100#any?(3#(d100<=5))`, big
  sorts), run it on **both** implementations over N seeds via the existing
  worker sampling channels (sequential runs for fair timing).
- Report per-implementation total/avg time and throughput, **and result
  agreement** — the mode doubles as an interactive differential checker.
- Numbers recorded into `nova/docs/` as the first published comparison;
  feeds the v0.6 decision on whether static linking jumps the queue.

**Exit:** benchmark mode deployed; first comparison numbers documented.

## v0.4 — Language-complete core

No stubs left in the shipped builtins; conformance becomes suite-shaped.

- Implement `reroll`/`explode` (sequence transformers; nominal/actual length
  semantics; drop display-only fragment decorations — repr concern, see
  v1.1). Remove the `UNIMPLEMENTED` stub.
- Decide & implement short-circuit element forcing for `any?` (and `all?`
  when it lands), per #13's comment; record the decision in `compat.md`.
- **Shared-suite extraction** (plan §9): move naive's semantic test tables
  into shared factories with per-impl divergence tags (`it.skipIf` /
  per-row expectations); naive and nova both run them. Tags mirror
  `compat.md` mechanically.
- Extend the differential suite: `reroll`/`explode` programs, laziness edge
  cases, more error-message coverage.

**Exit:** the full naive test corpus runs against nova with only tagged
divergences; `UNIMPLEMENTED` key is gone from the codebase.

## v0.5 — Limits & robustness

- `__checkpoint` emission at call boundaries in compiled code + inside
  builtins; soft timeout via a host `env.now()` import, reproducing naive's
  semantics (cooperative, checked at calls, fires "on the next call after
  the deadline"). `RESTRICTION_EXCEEDED_SOFT_TIMEOUT` is already keyed.
- Groundwork for fuel (total-call-count limits, issue #3) and chunked
  expensive ops — same checkpoint channel; activation deferred.
- TCO verification: enable naive's Y-combinator `it.todo` as a live nova
  test; deep-recursion programs terminate in bounded stack.
- Differential fuzzing v1: seeded random-program generator over the
  compatible subset; naive-vs-nova compare (values and error sets).

**Exit:** timeout tests green; Y-combinator test green; a 10k-program fuzz
run shows no unexplained divergences.

## v0.6 — Performance & size

- Port `execute.bench.ts` workloads into a naive-vs-nova benchmark suite
  (distinct from the interactive playground mode of v0.3 — this one runs in
  CI-style conditions and records into `nova/docs/`); target **≥10× naive**
  on evaluation-heavy programs with compile+instantiate overhead documented
  for small expressions.
- **Program-instance reuse on the sampling path**: `makeEvaluationGenerator`
  already compiles once, but re-instantiates the program module per sample
  (measured in v0.2's playground smoke test: nova ≈235k vs naive ≈390k
  samples/s on `d6`, where per-sample instantiation dominates trivial
  programs). Reusing one instance across samples looks safe — const-pool
  globals are re-initialized by `__main`'s prologue, table segments are
  identical per program, and `reset()` already rewinds the heap — verify
  and implement.
- Const-pool hoisting (runtime "execute consts once"; plan §3.4/§8).
- Size pass: `wasm-opt` in the build recipe, allocator/codegen review,
  documented **size budget** (initial targets: compiler ≤ 100 KB,
  builtins ≤ 50 KB after wasm-opt, before brotli; adjust to measurements).
- If v0.3's numbers showed cross-instance call overhead matters, evaluate
  moving the static-linking milestone forward.

**Exit:** benchmark numbers and measured sizes recorded in `nova/docs/`;
budget met or variance justified.

## v0.7 — Hardening (release candidate)

- Differential fuzzing v2: grammar-aware generator (closures, pipes,
  captures, dice, errors), seeded, with a divergence triage workflow.
- Error-key coverage audit: every key has a zh locale entry, a test, and a
  `compat.md` cross-reference where divergent.
- Docs: `@dicexp/nova` README (usage, assets, sync-vs-async creation),
  naive→nova migration notes, playground behavior differences.
- API freeze review: `I.Evaluator` conformance, `NovaAssets`, localization
  surface, `ExecutionRestrictions` (incl. nova-first memory limit field).

**Exit:** no known unexplained divergences; docs complete; CI-style
`just build-nova` green from a clean checkout.

## v1.0 — Published default

- Publish `@dicexp/nova` (+ `dicexp-nova-*` crates if we want crates.io
  presence); playground defaults to nova with naive selectable.
- `docs/Dicexp.md` and root README updated to name nova as the standard
  implementation; naive enters maintenance mode.
- `compat.md` frozen for 1.0.

## v1.1 — repr / step display

The "at least until here" goal.

- **Trace hooks** in builtins (feature-gated, zero-cost when off — batch
  mode requirement, #21): call-enter/exit/force events carrying value-handle
  identities. Event-based by design (TCO-safe — never stack-derived).
- Repr reconstruction: JS-side builder consuming the event buffer, emitting
  the existing `I.Repr` tree so `@dicexp/solid-components` works unchanged.
- Sequence fragment decorations revived **in the trace layer** (reroll
  discard markers 🔄/⚡️/✨, nominal/actual boundaries) — evaluation proper
  stays decoration-free.
- Playground: step display works under nova; the v0.4 notice is removed.
- Trace buffer policy for long runs (cap + replay-by-seed for full detail,
  per #1's established strategy).

**Exit:** step-display parity for representative programs (operators, HOFs,
closures, `reroll`/`explode`, error paths); per-builtin *custom* step
rendering explicitly deferred.

## v1.2+ — Beyond

Roughly prioritized, each its own small design doc when picked up:

- Static linking + tree-shaking: merge used builtins into single-file
  program modules (removes cross-instance call overhead; needs a small
  WASM merger or a `walrus` dependency at that point).
- External variables (#7): compile-time extraction pass + host lookup
  import; playground/rojo integration.
- Feature flags (#24): closures-off language subset; steps-off switch
  (formalizes v1.1's trace gating).
- Language growth (nova-first or both-implementations, decide per feature):
  labeled/keyword args (#17), range literals (#8), Unicode operator aliases
  (#21), `keepHighest/keepLowest` & friends (#18), strings-as-labels, maps,
  tuples.
- WASM tail-call proposal (`return_call_indirect`) as a trampoline
  replacement once support is universal — invisible optimization.

## Risks & open questions

- **repr fidelity**: `I.Repr` consumers (solid-components) expect naive's
  exact tree shapes; v1.1 needs a parity audit per node kind, and trace
  events must carry enough structure (callee identity, arg positions,
  sequence fragments) to rebuild them.
- **Cross-instance call overhead** (program↔builtins): assumed acceptable;
  the playground benchmark mode (v0.3) provides the numbers that decide
  whether static linking jumps the queue.
- **Early playground exposure** (v0.2): `reroll`/`explode` stubs and the
  missing soft timeout are visible to users before v0.4/v0.5 — mitigated by
  clear `尚未实现` error messages, the worker hard timeout, and naive
  remaining the playground default until v1.0.
- **Bump-allocator churn** from growing sequences (realloc-style growth
  leaks until reset): fine for short evaluations; watch worst-case memory
  in fuzzing/benchmarks; mitigate with pooling if it bites.
- **Trace buffer size** on pathological programs: cap + replay-by-seed
  rather than unbounded growth.
- **Divergence drift**: every "obviously better" fix widens the gap with
  naive's test corpus; the shared-suite tag mechanism (v0.2) is the control
  — tags must stay exhaustive and mirrored in `compat.md`.
