# nova — Compatibility with naive

`nova` aims to be the new de-facto standard implementation of dicexp. The
compatibility target is: **programs that `naive` evaluates *correctly*
evaluate to the same result in `nova`.** Bugs in `naive` are fixed, not
replicated ("`naive` was the de-facto standard; `nova` will be the new one").

This file is the authoritative list of **deliberate divergences**. Each entry
must be mirrored by divergence tags in the shared test suites
(`internal/test-utils-for-executing` / shared semantic suites).

## Deliberate divergences

1. **`and`/`or` short-circuit** (closes #13).
   Implemented as builtins with a `$lazy` second parameter: the RHS is only
   forced when the LHS demands it. naive forced both sides eagerly.
   `any?`/`all?` will short-circuit element forcing when added.

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

## TODO / deferred (tracked here until their own docs exist)

- repr (see #8 above) — trace hooks reserved; playground integration pending.
- `reroll`/`explode` — may land after the first working version.
- Soft timeout (`__checkpoint` + host `now()`); designed for future fuel
  (call-count) limits and chunked expensive ops (issue #3).
- Const-pool hoisting (runtime "execute consts once" — plan §3.4/§8).
- External variables `@x`/`@@x`/`@_x`: parsed; compile-time extraction pass
  deferred (issue #7).
- Feature flags (closures off; steps off) (issue #24).
- Builtin metadata codegen from Rust source of truth (issues #5/#18/#21);
  v1 playground reuses naive's static metadata for docs/completion.
- Labeled/keyword arguments (issue #17) — ABI reservation noted in plan.
- Finer-grained closure capture sets; wasm-opt size pass; static linking /
  tree-shaking of builtins.
