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

## 2026-10-06 — after v0.3 (playground benchmark mode, code-complete)

### Where we are

- Branch `nova`, ~38 local commits ahead of `main`, nothing pushed. v0.3 is
  **code-complete** (deploy is the owner's call, same as v0.2): benchmark
  mode is a third tab (基准) alongside 单次/抽样 in the control pane (owner
  nitpick — it started as a separate card); the naive/nova selector and the
  example select hide in benchmark mode (they don't apply), and tab labels
  carry no parentheticals (horizontal space). The benchmark editor keeps
  its OWN doc signal — presets must not clobber the autosaved main doc. First numbers: `nova/docs/benchmarks.md` —
  nova 0.52× naive on `d6` (instantiation-dominated), 3.4–12.8× faster on
  evaluation-heavy presets, **zero histogram disagreements** across all 9
  presets. v0.6's static-linking question is resolved by them (stays
  deferred; instance reuse is the first perf lever).
- New protocol option: `I.RemoteSamplingOptions { sampling?: { maxSamples } }`
  (interface + both worker packages) — worker stops itself after exactly N
  samples (seeds 0..N−1), making runs exactly comparable.
- Roadmap was restructured mid-iteration per owner: builtins impl (v0.7,
  issue #18's tables), nova-sourced builtin docs (v0.8, `#[doc]`
  extraction), repr (v0.9) all before v1.0; hardening is v0.10.

### Integration gotchas (cost real time this iteration)

- **Sampling channel semantics** (now pinned in dicexp-benchmark.ts's
  header): `keepSampling`'s async generator yields `["continue", …]`
  interval reports (every 500 ms); the FINAL stop/error report is the
  generator's *return* value (`done === true` iteration). Histograms are
  integer-only — non-number results error the run (this is why presets are
  integer-valued).
- Fixed mid-iteration (commit `3cbd5f9`, in BOTH worker packages — it was a
  pre-existing naive bug): the sampling handler fell through after the
  generator's terminal error and overwrote it with a bogus
  `抽样不支持求值结果 "runtime" 的类型` message. If sampling ever shows a
  wrong/confusing error again, suspect the handler first.
- **CodeMirror edit → Solid signal is not synchronous enough** for scripted
  smoke tests: after `execCommand("insertText", …)`, wait ~300 ms before
  clicking a button that captures the doc, or the run uses the stale code.
- `browser.evaluate` scripts are embedded strings: write `\\n` for a
  newline escape inside them; a raw newline inside a page-side string
  literal is a SyntaxError.
- zsh: `echo ===` is a parse error (`=cmd` expansion); commit messages with
  apostrophes/quotes — write to a temp file and `git commit -F`.
- AGENTS.md gained §Shell & process hygiene mid-iteration: servers in
  background, kill by port when done, check ports before binding.

### Subagent playbooks

- Ladder held again: solid-smarter (protocol extension, UI), smart (hook),
  solid-faster (preset verification) — no escalation.
- **Contract-first parallelization worked well**: lead writes the hook's
  public API + the preset list as committed files, then hook-impl and UI
  agents work in parallel against them with zero file overlap.
- smart agent's **bonus integration-sim** pattern is reusable for
  worker-protocol logic without a browser: bundle the real hook with
  faithful fakes of the client (`keepSampling`/`stopSampling` semantics) in
  a scratch dir, drive scenarios (114 checks). Much cheaper than browser
  driving for logic verification.
- Scratch differential verification of playground presets = temp vitest in
  `nova/packages/nova/test/` importing `../../../playground/…` — wait, the
  correct relative path from `nova/packages/nova/test/` is
  `../../../../playground/src/stores/benchmark-presets` (playground is at
  repo root, not under nova/). Delete the scratch file after.

### Open nuances for the owner (carried + new)

- Playground selector: persist across sessions? (still not, deliberate)
- v0.4: `any?` short-circuit decision (#13's comment).
- Whether to pin `assertion-error` in the workspace root (see plan §9.1).
- Benchmark panel shows a speedup even when a run was cancelled (rate over
  partial samples) — deliberate; suppress if it reads as misleading.
- nova-in-worker init-failure gap (forever-loading spinner if wasm fetch
  fails at initialize) — robustness item for v0.5.

### Environment notes

- Still no `wasm-opt`/`wasmtime` on this machine (v0.6 concern; npm
  `binaryen` ships wasm-opt if needed earlier).
- Desktop browser tools are proven for full benchmark sweeps (9 presets
  driven end-to-end through the real UI).

## 2026-10-06 — after v0.2 (nova in the playground, code-complete)

### Integration gotchas (still relevant)

- **Playground type-check was red at HEAD twice over** — hermeticity check
  for the future: `rm -rf` naive dists, then type-check.
- vite inlines assets < 4 KB as data URLs even with `?url` — the 82-byte
  shim needs `?url&no-inline` (graduated to plan §7.1).
- Worker manager/client/sampling logic has **no package-level tests**
  (mirrors naive); verification is playground integration + browser smoke.
- Mid-roll implementation switch: terminate/stop act on the *currently
  selected* manager, not the rolling one (switch back to stop). Accepted
  minor UX edge.
- `evaluatorInfo` in `@dicexp/nova` hardcodes the version (no
  `resolveJsonModule`) — keep in sync with package.json on bumps.

### Browser smoke-test playbook (reusable)

- Drive via `browser.evaluate` with async in-page `setTimeout` polling
  (the harness runtime has no timers; the page does).
- CodeMirror: focus `.cm-content`, then `document.execCommand('selectAll')`
  + `insertText` (+ the 300 ms settle delay noted above).
- ankor result widgets render in **shadow DOM** — plain `textContent` sees
  only headers; pierce with a TreeWalker collecting `shadowRoot`s.
- Playground buttons are real `<button>`s; sampling-stop text is `停止`,
  terminate `终止`; benchmark panel: `开始测试` / `取消`.

### Subagent playbooks (from v0.2, still true)

- Battery-first worked for parity bugs: build a scratch naive-vs-nova
  differential harness over malformed inputs *before* touching code.
- A harness restart killed a background subagent mid-work; resuming via
  `sessionID` + "continue" worked seamlessly (its scratch file was on disk).
