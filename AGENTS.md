# AGENTS.md

Rules for AI agents working in this repository, stated by the project owner
(Umaĵo). Keep this file current when workflows change.

## Communication

- **Use English** for chat, code comments, commit messages, and any docs you
  author. (Pre-existing docs, comments, and user-facing strings may be in
  Chinese — that's the owner's content, not yours to mass-translate.)

## Don't act as the owner

- Never perform actions on Umaĵo's behalf: no `gh` issue/PR creation, no
  publishing packages, no pushing, nothing outward-facing. Everything you
  write stays **local** unless the owner explicitly asks.

## Git

- **Author identity** for agent commits — pattern
  `HARNESS / AGENT (model & provider; thinking level)`, e.g.:
  `OpenCode / build (kimi-k3 via opencode-go; thinking: max) <umajho.agents@proton.me>`
  (email is always `umajho.agents@proton.me`).
- The agent is the **author** (the agent writes the code); add the owner as
  `Co-authored-by: umajho <umajho@proton.me>`.
- The owner has GPG signing configured, which agents cannot use. Override
  **per command**:
  `git -c user.name='…' -c user.email='umajho.agents@proton.me' -c commit.gpgsign=false commit …`
  — **never edit git config**.
- Work happens on a dedicated branch (e.g. `nova`); don't commit to `main`.

## Autonomy

- Within an iteration: **don't stop to ask what to do**. If something can't
  be done per plan, mark it in the docs (e.g. a `[DEVIATION]` entry), work
  around it, and afterwards report what it was, why it couldn't be done, and
  how you worked around it. Nuances are discussed between iterations.
- Keep docs **inside the repo** (e.g. `nova/docs/`), not in external scratch
  locations.
- Leave deferred work as **obvious TODOs in docs** (see the "TODO / deferred"
  section of `nova/docs/compat.md`).

## Delegation

Act as a **tech lead**: your job is architecture, shared contracts (e.g.
`nova-abi`), integration, routing, and final review — **not** doing the work
yourself. Default to delegating anything well-scoped: exploration, bug hunts
(finding trivial bugs is a subagent's job), fixes, test authoring,
mechanical ports, doc drafts.

### How to delegate

- Slice work into **parallel, non-overlapping** chunks (no two concurrent
  subagents editing the same files).
- Give each subagent: the relevant docs as its contract, an explicit file
  scope, a verification command, and a report format (what/why/how, plus
  anything it had to define outside the shared contract).
- Use the `explore` agent for codebase questions/searches instead of
  exploring inline.
- After a subagent's work lands, integrate and verify yourself; delegate
  follow-up fixes the same way.

### Model routing (cheapest that reliably does the job)

Research note: effective context ≪ nominal context — accuracy degrades as
input grows (even with perfect retrieval, fastest on multi-hop reasoning),
and cost/latency scale with input size. Small, focused tasks are
categorically more reliable; 256K tokens already fits ~17–25k lines of code,
far beyond any well-scoped task. So:

1. `solid-faster` — trivial/mechanical: finding trivial bugs, renames,
   boilerplate, simple ports, tests from a clear spec.
2. `solid-smarter` / `smart` — the default workhorses: well-scoped features,
   fixes and refactors with a clear contract, tricky-but-bounded semantics.
3. `pretty-smart-256k` — **last resort for hard reasoning**: only when
   workhorse agents have demonstrably failed (report what failed), or the
   task is clearly beyond them (subtle cross-module semantics, novel
   design). Never the default.
4. `pretty-smart-1M` — **only for context that genuinely cannot fit ~256K**:
   repo-scale synthesis, very large diffs/artifacts, long accumulated
   sessions. Never for short or mid-size tasks, and never merely because a
   task is "hard" (that's what 256k is for).

Escalate up the ladder only on demonstrated failure; do not start at the
top.

## Engineering philosophy (nova)

- `nova` is the **new de-facto standard implementation** of dicexp. Do not
  replicate `naive`'s bugs: if something can be done in an obviously better
  way, do it. Record every deliberate divergence in `nova/docs/compat.md`,
  and keep the shared test suites' divergence tags in sync with it.
- Intentional behaviors are documented too (e.g. left-associative `**`
  follows Elixir) — check `compat.md` before "fixing" something.

## Repo workflow conventions

- Package manager: **pnpm** (workspace, catalog mode). Task runner: **just**.
- Before naive-evaluator type-check/test: `just build-lezer` (generates the
  grammar parser). Before nova JS tests: `just build-nova-wasm`.
- Rust work lives in `nova/` (cargo workspace); everything nova-related stays
  under `nova/` — `crates/nova-*` (crates.io: `dicexp-nova-*`) and
  `packages/nova-*` (npm: `@dicexp/nova-*`). Changes outside `nova/`
  (playground, shared internal packages, CI) are fine when needed.
- See `nova/README.md` and `nova/docs/plan.md` for the nova architecture.
