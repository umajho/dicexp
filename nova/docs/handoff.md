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

## 2026-10 — after v0.1 (first working version)

### Where we are

- Branch `nova`, 10 local commits ahead of `main`, nothing pushed (pushing
  is the owner's call — see AGENTS.md).
- Test layers (all green): Rust unit tests (`cd nova && cargo test`, 110) →
  JS conformance + naive-vs-nova differential (`just test-nova`, 230).
  **The differential suite is the primary divergence oracle** — extend it
  whenever semantics change.
- `nova/packages/nova/wasm/*.wasm` are gitignored build artifacts — they go
  **stale silently** when crates change. Always `just build-nova-wasm`
  before JS tests, and after any crate edit.
- Any new deliberate divergence needs three things together: a `compat.md`
  entry, a zh locale entry (`nova/packages/nova/src/locale/zh.ts`), and a
  test (conformance and/or a differential-suite carve-out).

### Integration gotchas (things that cost real time)

- **Suspect the test harness before the code.** `test-utils-for-executing`'s
  error paths only execute when a test *fails*, so latent bugs hide there
  (we hit two: `assertion-error` v2 dropped its default export — the repo
  pins `"assertion-error": "*"` as a peer; and chai's bundled AssertionError
  class ≠ the package's, so `instanceof` fails — both fixed, but check there
  first when failures look weird).
- `tester.theyAreOk(...)` calls `it()` internally → call it at **describe
  level**, and construct the evaluator **synchronously at module level**
  (`createEvaluatorSync`) — async creation in `beforeAll` is too late.
- naive packages' main entries point at unbuilt `dist/`; for tests import
  their `/internal` entries (TS sources). `just build-lezer` is required
  before naive's evaluator can parse (generates `dicexp.grammar.out`).
- WASM↔JS boundary: `i64` maps to `BigInt` (value handles, `finalize`'s
  argument). `i32` maps to `number`.
- Sync `new WebAssembly.Module()` is limited to small modules on browser
  main threads — `createEvaluatorSync` is Node/worker-only by design; the
  playground worker must use async creation or accept the limit.
- `this.builtins` in `machine.ts` **is** the exports object (passing
  `.exports` again cost us a confusing "module is not an object or function"
  instantiation error — only programs importing `nova_rt` hit it, literals
  didn't).

### Subagent playbooks that worked

- Docs-as-contract worked end to end: both crates were built concurrently by
  subagents whose only shared reference was `nova-abi` + `plan.md`, and
  their layouts matched. Keep the ABI doc precise; it's worth the time.
- Tell implementation subagents to **verify beyond their own crate** (the
  compiler agent ran its own Node end-to-end probe and caught the shim-gen
  type bug). Also: forbid git mutations for workers; integration commits
  are the lead's job.
- Give each subagent an explicit "report items you defined outside the
  shared contract" requirement — that's how the error keys 42–49 got
  upstreamed cleanly.
- Routing per AGENTS.md's ladder — the two big crates went to
  `pretty-smart`; that was appropriate for greenfield ABI-fresh
  implementation, but v0.2+ is mostly mirror/integration work: start at the
  workhorse tiers.

### Open nuances to raise with the owner between iterations

- Playground selector: default stays naive until 1.0 (roadmap), but should
  the choice persist (localStorage) across sessions?
- Benchmark mode (v0.3): run the two implementations sequentially (fair
  timing) or concurrently (wall-clock, contention)? Leaning sequential.
- `any?` short-circuit decision is scheduled in v0.4 (#13's comment) —
  confirm with owner then, it's a visible semantic change.
- Whether to eventually pin `assertion-error` in the workspace root (the
  `"*"` peer range is what let v2 break the import shape).

### Environment & tooling notes

- This machine has **no `wasm-opt`/`wasmtime`** — size pass is v0.6;
  install only inside the working dir if needed earlier (npm `binaryen`
  package ships `wasm-opt`).
- `nova/crates/nova-compiler/examples/dump.rs` prints pseudo-WAT of emitted
  program modules — the codegen debugging tool (`cargo run -p
  dicexp-nova-compiler --example dump`).
- `nova-builtins` has a native `testutil` + mock-body registry for testing
  closure calls natively; its `env.call_closure` import is `cfg`-gated with
  a thread-local mock off-wasm.
- Builtins memory: 256 MiB hard cap via linker `--max-memory`
  (`nova/.cargo/config.toml`); allocation failure is a structured error,
  never a trap. `reset()` rewinds the bump allocator but **not** the RNG —
  always re-seed per evaluation (the JS wrapper does).
