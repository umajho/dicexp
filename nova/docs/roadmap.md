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
| v0.2 | **nova in the playground** | ✅ code-complete (deploy is the owner's call) |
| v0.3 | playground benchmark mode | ✅ code-complete (deploy is the owner's call) |
| v0.4 | language-complete core | ✅ done |
| v0.5 | limits & robustness | ✅ done |
| v0.6 | performance & size | |
| v0.7 | builtin completeness: implementation | |
| v0.8 | builtin docs sourced from nova | |
| v0.9 | **repr / step display** | |
| v0.10 | hardening (release candidate) | |
| v1.0 | published default | |
| v1.1+ | linking, externals, language growth | |

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

**Done (2026-10-06, code-complete; deploy is the owner's call).** Decisions
taken: **sequential** runs (naive first, then nova) — concurrent workers
would compete for CPU and skew the in-worker `Date.now` timing (resolves
the v0.2 open nuance); exact-N runs via a new `sampling.maxSamples`
protocol option so both sides cover exactly seeds 0..N−1 and agreement is
exact histogram equality. Numbers and analysis:
[`benchmarks.md`](./benchmarks.md) — headline: nova 0.52× naive on trivial
programs (per-sample instantiation dominates; instance reuse is the v0.6
lever), 3.4–12.8× faster on evaluation-heavy ones; zero histogram
disagreements across all 9 presets.

## v0.4 — Language-complete core

No stubs left in the shipped builtins; conformance becomes suite-shaped.

- Implement `reroll`/`explode` (sequence transformers; nominal/actual length
  semantics; drop display-only fragment decorations — repr concern, see
  v0.9). Remove the `UNIMPLEMENTED` stub.
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

**Done (2026-10-06).** `reroll`/`explode` implemented as a new transformer
sequence source replicating naive's debt-counter bookkeeping exactly
(signed remain, per-output is_last, sources infinite past nominal, `$sum`
flag mirrored, explode extras appended after base outputs, the
explode-reports-as-reroll quirk kept); display-only fragment decorations
dropped (v0.9 concern). `UNIMPLEMENTED` (key 41) removed from abi,
builtins, and the zh locale. `any?/1` short-circuits element forcing per
#13's comment (recorded in compat #1; `all?` will mirror in v0.7).
Shared-suite extraction landed: naive's four semantic tables live in
`internal/test-utils-for-executing/suites/` with divergence tags
mirroring compat.md; nova runs the full 429-row corpus (423 passed |
3 skipped soft-timeout | 3 todo) with zero untagged failures. compat #4
(sum/product of []) withdrawn — naive already returned 0/1. Differential
suite 146 → 221 (reroll/explode parity, Ended semantics, error messages,
naive-crash carve-outs). Benchmark presets audited: the any? preset was
replaced (short-circuit shifts RNG — agreement rule: pre-force with
`map`), reroll/explode presets added; all 11 presets agree on seeds 0–19.
Numbers: 121 Rust + 733 JS tests (3 skipped, 3 todo) green.

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

**Done (2026-10-06).** The checkpoint channel (plan §3.9) is the single
mechanism: `nova_rt.__checkpoint()` at every regular-call and value-call
site (compiler-emitted guard; a fired checkpoint's ERROR handle becomes the
call's own value — no traps), armed per evaluation by
`nova_rt.set_soft_timeout` + the `env.now` host import; naive-exact
semantics (strict `>`; checkpoint-silent stretches — builtin loops,
repetition of call-free bodies — never fire) and exact zh message parity.
Placement is naive-parity by analysis: builtin-internal insertion points
stay reserved for the (additive, ABI-stable) fuel/chunked-ops evolution.
Shared-suite timeout rows run on BOTH impls (per-impl busy-work shapes —
naive cannot build large flat repetition-lists at all, see compat #9); only
the `sleep/1` rows stay naive-only. TCO verified by substitution (the
`if/3` Y-combinator row awaits v0.7): a simulated-if Y-combinator without
the trailing `.()` sums 1..100000 live on nova (compat #6 records why
`.()` defeats the trampoline and why naive stays `todoFor` — fatal OOM,
not a clean overflow). Fuzzing v1: typed-AST generator with range/distribution
tracking and compat-cited exclusions; **180k programs × 3 eval seeds
(540k evaluation pairs, incl. one 100k-program stress run), zero
unexplained divergences.** The fuzzer found one real divergence — naive's
map/zipWith error-beacon poisoning — recorded in compat #9 and pinned in
the differential suite. Also: the nova-in-worker init-failure gap is fixed
(bounded retry + real error surfaced in the playground instead of a
forever spinner; naive's worker keeps the latent gap) and the ABI gained a
version guard (`ABI_VERSION = 2`). Numbers: 129 Rust + 753 JS tests
(2 skipped = sleep rows, 3 todo) + naive 208 / 62+4todo / 158; playground
tsc + vite build clean; browser smoke: soft timeout fires under nova with
the exact naive message, init failure (hidden wasm assets) surfaces a real
error card, recovery after restore confirmed.

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
- Static linking stays deferred (v1.1+): v0.3's numbers resolved the
  cross-instance-call-overhead question — nova wins 3.4–12.8× on
  evaluation-heavy programs *with* the hop in place. The trivial-program
  gap is instantiation overhead instead (see the instance-reuse bullet).

**Exit:** benchmark numbers and measured sizes recorded in `nova/docs/`;
budget met or variance justified.

## v0.7 — Builtin completeness: implementation

Every builtin intended for 1.0 exists in nova.

- **Implement the missing builtins intended for 1.0.** The intended set is
  issue #18's tables ("默认作用域中的通常函数的实现进展记录"); the ❌/部分
  entries include: `abs`, `count/1` (length), `has?`, `min`, `max`, `all?`,
  `sort/2` (closure comparator), `reverse`, `concat`, `prepend`,
  `at/3` (with default), `duplicate`, `flatten`, `flattenAll`, `flatMap`,
  `foldl`, `foldr`, `unfold`, `iterate`, `last`, `init`, `take`,
  `takeWhile`, `drop`, `dropWhile`, and `if/*` (note: #18's
  `if(a, b, else: c)` shape depends on labeled arguments, #17 — decide the
  positional-vs-labeled shape when implementing). Also in scope: the
  partial entries' missing halves where they are 1.0-worthy (`all?`/`any?`
  short-circuit per v0.4's decision; comparison operators accepting
  booleans, as `sort/1` already does). Explicitly NOT in scope: `inspect`
  (abandoned in #18), the range-operator forms of `reroll`/`explode`
  (low-priority, depend on #8), `d%` (being considered for removal in #18).
  Anything else deliberately NOT making 1.0 moves to v1.1+ explicitly, with
  the reason recorded here.

**Exit:** every builtin intended for 1.0 is implemented and covered by the
shared/differential suites.

## v0.8 — Builtin docs sourced from nova

The playground's builtin documentation/completion is sourced from nova
itself instead of naive's static metadata.

- **Builtin metadata codegen from the Rust source of truth** (issues
  #5/#18/#21): extract the builtin declarations and their `#[doc]`
  comments from `crates/nova-builtins` at build time (a small extractor —
  e.g. parsing `#[doc]` attributes — emitting a JSON/TS metadata module),
  and switch the playground's documentation pane and editor completion
  from naive's static metadata to nova's generated metadata. naive's
  metadata stays for naive itself.

**Exit:** the playground's docs/completion no longer read naive's builtin
metadata; the generated metadata covers every builtin shipped at this
point.

## v0.9 — repr / step display

The "at least until here" goal — pulled before 1.0: nova does not become
the default without step display.

- **Trace hooks** in builtins (feature-gated, zero-cost when off — batch
  mode requirement, #21): call-enter/exit/force events carrying value-handle
  identities. Event-based by design (TCO-safe — never stack-derived).
- Repr reconstruction: JS-side builder consuming the event buffer, emitting
  the existing `I.Repr` tree so `@dicexp/solid-components` works unchanged.
- Sequence fragment decorations revived **in the trace layer** (reroll
  discard markers 🔄/⚡️/✨, nominal/actual boundaries) — evaluation proper
  stays decoration-free.
- Playground: step display works under nova; the "steps unavailable" notice
  added in v0.2 is removed.
- Trace buffer policy for long runs (cap + replay-by-seed for full detail,
  per #1's established strategy).

**Exit:** step-display parity for representative programs (operators, HOFs,
closures, `reroll`/`explode`, error paths); per-builtin *custom* step
rendering explicitly deferred.

## v0.10 — Hardening (release candidate)

- Differential fuzzing v2: grammar-aware generator (closures, pipes,
  captures, dice, errors), seeded, with a divergence triage workflow.
- Error-key coverage audit: every key has a zh locale entry, a test, and a
  `compat.md` cross-reference where divergent.
- **Repr parity audit**: `I.Repr` consumers (solid-components) expect
  naive's exact tree shapes — audit per node kind, and verify the v0.9
  trace events carry enough structure (callee identity, arg positions,
  sequence fragments) to rebuild them.
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

## v1.1+ — Beyond

Roughly prioritized, each its own small design doc when picked up:

- Static linking + tree-shaking: merge used builtins into single-file
  program modules (removes cross-instance call overhead; needs a small
  WASM merger or a `walrus` dependency at that point).
- External variables (#7): compile-time extraction pass + host lookup
  import; playground/rojo integration.
- Feature flags (#24): closures-off language subset; steps-off switch
  (formalizes v0.9's trace gating).
- Language growth (nova-first or both-implementations, decide per feature):
  labeled/keyword args (#17), range literals (#8), Unicode operator aliases
  (#21), strings-as-labels, maps, tuples.
- WASM tail-call proposal (`return_call_indirect`) as a trampoline
  replacement once support is universal — invisible optimization.

## Risks & open questions

- **repr fidelity**: `I.Repr` consumers (solid-components) expect naive's
  exact tree shapes; v0.10's hardening includes a parity audit per node
  kind, and v0.9's trace events must carry enough structure (callee
  identity, arg positions, sequence fragments) to rebuild them.
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
