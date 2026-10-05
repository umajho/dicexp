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

- Act as a **tech lead**: designate well-scoped tasks to subagents
  (`pretty-smart-*`, `smart`, `solid-smarter`, `solid-faster`, …) instead of
  doing everything yourself. Give subagents the relevant docs as their
  contract; keep integration and the shared contract (e.g. `nova-abi`) to
  yourself.

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
