import { it } from "vitest";

import { Unreachable } from "@dicexp/errors";

import type { EvaluationTester } from "../mod";

/** Implementations that consume the shared suites. */
export type ImplTag = "naive" | "nova";

/**
 * Deliberate divergences between the implementations (see
 * `nova/docs/compat.md` — the authoritative numbered list), plus
 * capability gaps that are not (yet) language divergences. Each `div*`
 * member mirrors its compat.md entry mechanically — keep this union in
 * sync with compat.md.
 *
 * - `"div1-short-circuit"` — compat.md §1: nova's `and`/`or` short-circuit
 *   (builtins with a `$lazy` second parameter) and `any?/1` short-circuits
 *   element forcing; naive forced both sides / every element eagerly.
 *   `all?/1` (v0.7) mirrors the `any?/1` split: nova stops forcing at the
 *   first `false`; naive's fresh `all?/1` flattens eagerly (its own
 *   `any?/1` style).
 * - `"div2-64bit-divmod"` — compat.md §2: nova's `//` and `%` use proper
 *   64-bit semantics; naive computed them via JS `| 0`, silently
 *   truncating operands to 32 bits.
 * - `"div3-compile-time-unknowns"` — compat.md §3: unknown identifiers and
 *   functions are compile-time errors in nova; naive produced lazy runtime
 *   errors.
 * - `"div4-empty-sum-product"` — compat.md §4: nova defines `sum([]) = 0`
 *   and `product([]) = 1`; naive's behavior on empty lists was
 *   undefined-as-spec (a FIXME).
 * - `"div5-error-dedup"` — compat.md §5: nova reports each duplicate error
 *   once; naive could report some errors (e.g. from `a.()`) twice.
 * - `"div6-tco"` — compat.md §6: nova has trampolined TCO; programs that
 *   overflow naive's JS stack (e.g. Y-combinator recursion) terminate in
 *   nova.
 * - `"div7-memory-limit"` — compat.md §7: nova enforces a hard memory limit
 *   (`error.memoryLimitExceeded`); naive had no memory limit.
 * - `"div8-no-repr"` — compat.md §8: nova v1 produces no
 *   `ExecutionAppendix.representation` (repr deferred to v0.9).
 * - `"div9-crash-fixes"` — compat.md §9: nova fixes naive crash/bug edge
 *   cases (trailing slots after an element error, i128 accumulation,
 *   negative `d`/`#` counts, `~` ranges beyond 2⁵³). (The `any?`-on-nested-
 *   lists bullet was retired in v0.7: naive's `flattenListAll` indexing bug
 *   was fixed in naive itself, so both implementations now agree — rows are
 *   re-pinned to the fixed behavior without a tag.)
 * - `"div10-parse-fixes"` — compat.md §10: parse-level fixes (comparison
 *   captures, astral identifiers, one-at-a-time parse errors, span
 *   rendering).
 *
 * Capability gaps (rows carrying them cannot (yet) run under the other
 * implementation; not compat.md divergences):
 *
 * - `"naive-soft-timeout"` — only the sleep/1-based rows are naive-only:
 *   they need a host-injected `sleep/1` test function (a naive-only
 *   capability, not a divergence). The other soft-timeout rows (busy-work
 *   based) run under both implementations — nova got `softTimeout` in v0.5
 *   (see `nova/docs/plan.md` §3.9).
 * - `"naive-only-parse-messages"` — reserved for rows comparing naive's
 *   exact parse-error messages; nova's parse-message conformance currently
 *   lives in its differential suite (compat.md §10) — pin per-impl messages
 *   here once nova's consumer needs them.
 */
export type DivergenceTag =
  | "div1-short-circuit"
  | "div2-64bit-divmod"
  | "div3-compile-time-unknowns"
  | "div4-empty-sum-product"
  | "div5-error-dedup"
  | "div6-tco"
  | "div7-memory-limit"
  | "div8-no-repr"
  | "div9-crash-fixes"
  | "div10-parse-fixes"
  | "naive-soft-timeout"
  | "naive-only-parse-messages";

/** A value that differs per implementation. */
export type PerImpl<T> = Partial<Record<ImplTag, T>>;

/**
 * Tags and per-impl run directives every shared-suite row may carry.
 * `tags` are documentation (which compat.md divergence the row is
 * sensitive to); `skipFor`/`todoFor` are the actionable data.
 */
export interface RowMeta {
  /** Which compat.md divergence(s) this row is sensitive to. */
  tags?: readonly DivergenceTag[];
  /** Implementations that skip this row (`it.skip`). */
  skipFor?: readonly ImplTag[];
  /** Implementations for which this row stays a `todo`. */
  todoFor?: readonly ImplTag[];
}

/**
 * `it` with per-impl gating: `todoFor`/`skipFor` decide between
 * `it.todo`/`it.skip` and a live run for the context's implementation.
 * An impl listed in `todoFor` ignores the body (as `it.todo` does).
 */
export function itTagged(
  ctx: { impl: ImplTag },
  name: string,
  meta: RowMeta,
  run?: () => void | Promise<void>,
): void {
  if (meta.todoFor?.includes(ctx.impl)) {
    it.todo(name);
    return;
  }
  if (meta.skipFor?.includes(ctx.impl)) {
    it.skip(name, () => {});
    return;
  }
  it(name, run ?? (() => {}));
}

/**
 * Runs the branch of the context's implementation — the per-impl mechanism
 * for bespoke (non-table) test bodies; table rows carry their per-impl data
 * on the row instead. An implementation without a branch is a programming
 * error (throws) — every implementation must be pinned.
 */
export function forImpl(
  ctx: { impl: ImplTag },
  branches: PerImpl<() => void>,
): void {
  const branch = branches[ctx.impl];
  if (branch === undefined) {
    throw new Unreachable(`未定义实现的分支：\`${ctx.impl}\``);
  }
  branch();
}

/**
 * What the shared suites need from an implementation: build one context
 * and pass it to the `define*Suite` factories. Everything must be usable
 * synchronously — the factories register `it`s at collection time, so
 * testers must be constructable at module level (see `nova/docs/plan.md`
 * §9.1).
 */
export interface SuiteContext {
  impl: ImplTag;

  /** Tester over the implementation's default test scope. */
  tester: EvaluationTester;

  /**
   * Builds a tester whose top-level scope resolves (at least) the given
   * builtins (`"sum/1"`, `"+/2"`, `"^/2"`, …). Implementations without
   * scoping (nova links its builtins) return their default tester.
   */
  makeTesterFor(names: readonly string[]): EvaluationTester;

  /**
   * Optional; only for implementations that can inject test-only regular
   * functions into a scope (naive). A tester whose scope resolves the
   * operators plus `sleep/1` — a function that busy-waits its integer
   * argument (in ms). Only the sleep/1-based rows are skipped when this is
   * absent (tag `"naive-soft-timeout"`).
   */
  makeSleepTester?: () => EvaluationTester;
}

/**
 * The parsing suite needs no testers — only the implementation's parse.
 */
export interface ParsingSuiteContext {
  impl: ImplTag;

  /**
   * The implementation's parse. `["ok", …]` carries the implementation's
   * own parsed representation (naive: `Node` from `@dicexp/nodes`; nova:
   * phase 2 decides — e.g. a compile-based adapter), compared via
   * `deepEqual` when a row expects one.
   */
  parse: (code: string) => ParseResultForTest;
}

/**
 * A parse result, normalized for the parsing suite. The `ok` payload is
 * the implementation's own representation — `null` means "no
 * representation" (nova: its compile-based parse has no node form), in
 * which case representation-comparing rows assert only that parsing
 * succeeded. Only rows comparing against the payload (equivalence rows,
 * explicit-representation rows) depend on its shape.
 */
export type ParseResultForTest =
  | ["ok", unknown] // null → no representation
  | ["error", { message: string }];
