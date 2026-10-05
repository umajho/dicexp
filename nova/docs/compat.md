# nova — Compatibility with naive

`nova` aims to be the new de-facto standard implementation of dicexp. The
compatibility target is: **programs that `naive` evaluates *correctly*
evaluate to the same result in `nova`.** Bugs in `naive` are fixed, not
replicated ("`naive` was the de-facto standard; `nova` will be the new one").

This file is the authoritative list of **deliberate divergences**. Each entry
must be mirrored by divergence tags in the shared test suites
(`internal/test-utils-for-executing` / shared semantic suites). Any new
deliberate divergence needs **three things together**: a `compat.md` entry,
a zh locale entry (`nova/packages/nova/src/locale/zh.ts`) where the
divergence is user-visible in messages, and a test (conformance and/or a
differential-suite carve-out). The seeded differential suite is the
primary divergence oracle — extend it whenever semantics change.

## Deliberate divergences

1. **`and`/`or` short-circuit** (closes #13).
   Implemented as builtins with a `$lazy` second parameter: the RHS is only
   forced when the LHS demands it. naive forced both sides eagerly.
   **`any?/1` also short-circuits element forcing** (per #13's comment:
   "`any?/1`、`all?/1` 也许也应该短路。"): the flatten-DFS stops at the
   first `true` element and remaining elements are never forced. naive
   forced every element. Observable consequences, beyond RNG consumption
   by unforced dice: `any?([true, 1 // 0 > 0])` is `true` in nova but a
   division error in naive, and `any?([true, 5])` is `true` in nova but a
   non-boolean-element error in naive. `all?/1` will mirror this when it
   lands (roadmap v0.7).

2. **`//` and `%` use proper 64-bit semantics.**
   naive computed them via JS `| 0`, silently truncating operands to 32 bits
   (e.g. `9007199254740991 // 2` gave a wrong result). nova uses i64
   truncating division/modulo; results are still range-checked to ±(2^53−1).

3. **Unknown identifiers / functions are compile-time errors.**
   naive produced *lazy* runtime errors (its own FIXME says they should be
   eager), so `[foo, 1] |> at(0)` evaluated to `1`. nova rejects such
   programs at compile time. Same for `unknownRegularFunction`,
   `duplicateClosureParameterNames`.

4. **`sum([])` → `0`, `product([])` → `1`.**
   Fixes the upstream FIXME (issue #18): naive's behavior on empty lists was
   undefined-as-spec.

5. **Duplicate error reporting is deduplicated.**
   naive had a known low-priority bug where some errors (e.g. from `a.()`)
   were reported twice. nova reports once. Differential tests compare error
   sets, not sequences.

6. **TCO via trampolined thunk forcing** (closes #2).
   Tail call chains bounded by thunk forcing run in constant WASM stack;
   programs that overflow naive's JS stack (e.g. Y-combinator recursion)
   terminate in nova.

7. **Hard memory limit.**
   The builtins module declares a maximum page count; allocation failure
   raises `error.memoryLimitExceeded` (new key) instead of OOM-ing the tab.
   naive had no memory limit.

8. **repr / step display unavailable (v1).**
   `ExecutionAppendix.representation` is not produced by nova v1. The
   playground shows an "unavailable" notice instead of the step tree when
   nova is selected. Will be retrofitted later as event-trace-based repr
   (hooks are zero-cost when disabled).

9. **Crash/bug fixes in edge cases.**
   - `any?` on nested lists: naive's `flattenListAll` silently drops elements
     (indexing bug); nova flattens correctly (iterative DFS).
   - `map`/`zipWith` after an element errors: naive leaves leaky
     `valueBoxUnevaluated` boxes in trailing slots (forcing them reported
     `未求值（实现细节泄漏）`); nova fills trailing slots with the same error
     handle. Evaluation/RNG order up to the first error is unchanged.
   - `sum`/`product` accumulate in i128 with a final range check. Ultra-edge
     divergence: `product([max, max, max, 0])` underflows to `0` in naive's
     f64 math, while nova (exact math) reports the unrepresentable
     intermediate with `LIMITATION_EXCEEDED_MAX_SAFE_INTEGER`.
   - `sequence$sum` sums are accumulated in i128 and range-checked; naive
     summed dice streams with unchecked doubles (silent garbage beyond 2⁵³).
   - `d/2` with `n < 0` and `#` with a negative count both *crash* naive
     (`new Array(neg)` RangeError); nova returns `0` / the empty list,
     extending the existing `n = 0` / `count = 0` rules.
   - `~` ranges spanning more than 2⁵³ values made naive's RNG throw
     `Unimplemented`; nova handles them with the same u64 rejection math.
   - `reroll`/`explode` with a closure that errors or returns a
     non-boolean, over a `sequence$sum` source whose result is summed
     (top level or via `sum`): naive *crashes* with an uncaught
     `ReferenceError` (the sum-cast feeds an error box into
     `badFinalResult`, whose localization hits an undeclared variable in
     `internal/l10n/lib.ts`); nova reports the underlying error cleanly
     (`CLOSURE_RETURN_TYPE_MISMATCH`, still named `reroll/2` for both —
     see the quirk below). Differential-suite carve-out: those programs
     are pinned nova-only.

10. **Parse-level fixes.**
    - Comparison captures: naive *rejects* `&</2`, `&<=/2`, `&>/2`, `&>=/2`,
      `&==/2` at parse time (a Lezer tokenization quirk — the grammar text
      lists them). nova accepts them.
    - Astral identifiers: naive's UTF-16-code-unit tokenizer can never lex
      astral `ID_Start` characters; nova is char-based and accepts them.
    - Parse errors are reported one at a time (with a span); naive collected
      all `⚠` ranges into a single message (for inputs where Lezer emits
      several — e.g. `(((` — nova's message equals naive's message up through
      the first range). (Semantic/compile errors are all collected, as in
      naive.)
    - Parse-error spans are rendered with naive's exact `⚠`-range format
      (`自列 from 至列 to：excerpt`, the excerpt starting one char before the
      span, columns being the raw 0-based span bounds). At end-of-input the
      span is the empty range at the input end — exactly where naive's `⚠`
      sits — so the message shows the last character (trailing whitespace
      included): full parity, including empty and full-width sources
      (excerpts show the half-width-normalized text). Mid-input, nova's span
      is the offending *token*; naive's Lezer recovery `⚠`s are skip-regions
      that only sometimes coincide with it (when they do — e.g. `1 1`,
      `1+2)` — the messages match exactly). Where they differ, nova's span is
      kept because naive's is a recovery artifact (`d-`/`d+` → empty `⚠`
      where the operand was expected, `]` → an empty `⚠` with no excerpt,
      `((1+)` → three empty `⚠`s). Both sides are pinned in
      `test/differential.test.ts`.

## Naive quirks deliberately replicated (for now)

Flagged during the port as candidates to fix in **both** implementations
(they are quirks, not semantics; kept for differential parity):

- `d/1` and `d/2` range errors render the left operand as a hardcoded `1`
  (`d 0` errors with `操作 “1 d 0” 非法：…`) — naive quirk.
- The `**` negative-exponent error does not parenthesize a negative base.
- `explode/2` reports closure-return-type errors as if from `reroll/2`
  (confirmed live in naive; replicated in nova's `CLOSURE_RETURN_TYPE_MISMATCH`
  params for both builtins).

## Behavior preserved (non-exhaustive)

- Laziness: lazy list elements, lazy `$lazy` args, `at`/`head` returning
  unforced elements, lazy error values with direct/indirect distinction.
- Memoized named bindings ("具名的变量其值固定"); `#` re-evaluates its body
  per iteration; sequences memoize per position (issue #20).
- Implicit casts: `sequence$sum` → sum, `sequence` → list on unwrap.
- `d/2` with `n = 0` → `0` (no RNG consumed).
- Error messages (default zh locale): naive-exact strings via i18n
  key+params, including `callArgumentTypeMismatch` positions and
  `limitationExceeded` for ±(2^53−1) overflow.
- Same seed ⇒ same dice stream as naive (exact xorshift7 port), enabling
  replay-by-seed and seeded differential testing.
- `**` is **left**-associative (`2 ** 3 ** 2` = 64), following Elixir
  (dicexp's stated style reference), where `**` is explicitly
  left-associative. This is intentional, not a bug — do not "fix" it to the
  Python convention.

## TODO / deferred (tracked here until their own docs exist)

Status after v0.4 (language-complete core): `reroll`/`explode` are
implemented (no stubs remain) and naive's semantic corpus runs against
both implementations from shared tagged factories
(`internal/test-utils-for-executing/suites/` — consumed by naive's own
test files and by `nova/packages/nova/test/shared-suites.test.ts`).

- repr (see #8 above) — trace hooks reserved; playground integration pending;
  roadmap v0.9 (pre-1.0).
- Soft timeout (`__checkpoint` + host `now()`); designed for future fuel
  (call-count) limits and chunked expensive ops (issue #3).
- Const-pool hoisting (runtime "execute consts once" — plan §3.4/§8).
  Not in the first working version; mechanism reserved (program-global thunk
  handles). Note: value calls with argc > 64 already allocate arg frames via
  `env_new` instead of using the scratch buffer.
- External variables `@x`/`@@x`/`@_x`: parsed; compile-time extraction pass
  deferred (issue #7).
- Feature flags (closures off; steps off) (issue #24).
- Builtin metadata codegen from Rust source of truth (issues #5/#18/#21);
  v1 playground reuses naive's static metadata for docs/completion.
  Roadmap v0.7 implements the remaining intended builtins (issue #18's
  tables); roadmap v0.8 switches docs/completion to nova-sourced metadata
  (e.g. via `#[doc]`-attribute extraction from `crates/nova-builtins`).
- Labeled/keyword arguments (issue #17) — ABI reservation noted in plan.
- Finer-grained closure capture sets; wasm-opt size pass; static linking /
  tree-shaking of builtins.
