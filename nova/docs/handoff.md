# nova — Lead's handoff notebook

> Tacit knowledge for the next session/iteration that doesn't belong in the
> architecture docs. **Read this after** `AGENTS.md`, before
> `docs/roadmap.md` / `docs/plan.md` / `docs/compat.md`.
>
> **Lifecycle (per AGENTS.md §Handoff):** this is a *rolling* notebook, not
> an archive. New dated sections go on top; keep at most current + previous
> sections (prune the rest); anything still true after an iteration must
> graduate to the durable docs; delete obsolete entries outright; keep the
> whole file ≤ ~150 lines.

## 2026-10-06 — after v0.2 (nova in the playground, code-complete)

### Where we are

- Branch `nova`, 20 local commits ahead of `main`, nothing pushed. v0.2 is
  **code-complete** (deploy is the owner's call): `@dicexp/nova-in-worker`
  mirrors naive's worker package; the playground has a naive/nova selector
  (naive default, not persisted), a "steps unavailable under nova" notice,
  and the vite wasm-asset strategy documented in `plan.md` §7.1.
- Test layers (all green): 112 Rust (`cd nova && cargo test`) → 233 JS
  (`just test-nova`) → naive regression (`just test-naive-evaluator-all`)
  → playground type-check + `vite build` → interactive browser smoke test
  of both implementations (single, sampling, parse error, notice).

### Integration gotchas (cost real time this iteration)

- **Playground type-check was red at HEAD twice over** (Repr-nullable
  `representation` vs `DicexpEvaluation.repr`; naive-in-worker root-import
  needing built dists) — both fixed. Hermeticity check for the future:
  `rm -rf` naive dists, then type-check.
- vite inlines assets < 4 KB as data URLs even with `?url` — the 82-byte
  shim needs `?url&no-inline` (graduated to plan §7.1).
- **nova-in-worker init-failure gap**: if wasm fetch/compile fails at
  `initialize`, `readinessWatcher(true)` never fires — the playground shows
  a forever-loading spinner (error only in console). Same structure as
  naive, but naive's init never fails. Robustness item for v0.5.
- Worker manager/client/sampling logic has **no package-level tests**
  (mirrors naive); verification is playground integration + browser smoke.
- Mid-roll implementation switch: terminate/stop act on the *currently
  selected* manager, not the rolling one (switch back to stop). Accepted
  minor UX edge.
- `evaluatorInfo` in `@dicexp/nova` hardcodes the version (no
  `resolveJsonModule`) — keep in sync with package.json on bumps.

### Browser smoke-test playbook (reusable for v0.3's benchmark mode)

- Drive via `browser.evaluate` with async in-page `setTimeout` polling
  (the harness runtime has no timers; the page does).
- CodeMirror: focus `.cm-content`, then `document.execCommand('selectAll')`
  + `insertText`.
- ankor result widgets render in **shadow DOM** — plain `textContent` sees
  only headers; pierce with a TreeWalker collecting `shadowRoot`s.
- Playground buttons are real `<button>`s now (were `<div class="btn">`);
  sampling-stop text is `停止`, terminate `终止`.

### Subagent playbooks

- Workhorse tiers sufficed for ALL of v0.2 (solid-smarter: package surface;
  smart: worker port, playground wiring, parser-span fix) — no escalation
  needed. The ladder held.
- Battery-first worked for the message-parity bug: the agent built a
  scratch naive-vs-nova differential harness over 57 malformed inputs
  *before* touching code, which exposed that the spans were right and the
  locale rendering wrong. Good pattern for parity bugs.
- A harness restart killed a background subagent mid-work; resuming via
  `sessionID` + "continue" worked seamlessly (its scratch file was on disk).

### Performance notes

- Sampling `d6`: nova ≈235k samples/s vs naive ≈390k/s. Program compile is
  once per session; per-sample **instantiation** dominates trivial
  programs. v0.3 benchmark workloads should be evaluation-heavy;
  instance-reuse idea recorded in roadmap v0.6.

### Open nuances for the owner (carried, still open)

- Playground selector: persist across sessions? (currently not, deliberate)
- v0.3 benchmark mode: sequential (leaning) vs concurrent runs.
- v0.4: `any?` short-circuit decision (#13's comment).
- Whether to pin `assertion-error` in the workspace root (see plan §9.1).

### Environment notes

- Still no `wasm-opt`/`wasmtime` on this machine (v0.6 concern; npm
  `binaryen` ships wasm-opt if needed earlier).
- Desktop browser tools (`browser.evaluate` & co.) are available and
  proven for playground smoke tests — use them instead of eyeballing builds.
