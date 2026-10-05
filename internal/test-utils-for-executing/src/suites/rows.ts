import { it } from "vitest";

import type * as I from "@dicexp/interface";

import { RuntimeError } from "@dicexp/naive-evaluator-runtime/runtime-errors";

import type {
  EvaluationOptionsForTest,
  EvaluationTester,
} from "../mod";
import type {
  ImplTag,
  PerImpl,
  RowMeta,
  SuiteContext,
} from "./context";

/**
 * Error expectations for the shared suites: naive's evaluator returns
 * naive-runtime `RuntimeError` objects (`{ type: "error", message }`),
 * compared with `deepEqual`; other implementations return plain
 * `I.RuntimeError` (`{ message }`), compared by message. String
 * expectations compare by message for every implementation.
 */
export function expectedRuntimeErrorFor(
  impl: ImplTag,
  error: string | RuntimeError,
): string | RuntimeError {
  if (impl === "naive" || typeof error === "string") return error;
  return error.message;
}

/**
 * A row of an "evaluate ok" table. The plain forms (`"code"`,
 * `["code", expected]`) run under every implementation, exactly as
 * naive's tables do today; the object form adds divergence data.
 */
export type OkCase<T extends I.JSValue = I.JSValue> =
  | string
  | [string, T | undefined]
  | OkCaseObject<T>;

export interface OkCaseObject<T extends I.JSValue = I.JSValue>
  extends RowMeta {
  code: string;
  /**
   * Expected value for implementations without an `expectedByImpl`
   * entry. `undefined` → any ok result passes.
   */
  expected?: T;
  /**
   * Per-impl expected values. An implementation with an entry uses it
   * (an explicit `undefined` → any ok result); one without an entry falls
   * back to `expected`; if neither exists the row is skipped for it — an
   * unpinned divergence must never become a phantom pass.
   */
  expectedByImpl?: PerImpl<T | undefined>;
}

/**
 * `EvaluationTester.theyAreOk`, parameterized by the implementation for
 * divergence-aware rows. Registers the same `case ${i}: ${code}` tests as
 * the tester method does; call it at `describe` level, like the tester
 * method (see `nova/docs/plan.md` §9.1).
 */
export function theyAreOk<T extends I.JSValue = I.JSValue>(
  ctx: SuiteContext,
  tester: EvaluationTester,
  table: readonly OkCase<T>[],
  opts?: EvaluationOptionsForTest,
): void {
  for (const [i, row] of table.entries()) {
    const { code, expected, byImpl, meta } = normalizeOkCase(row);
    const name = `case ${i + 1}: ${code}`;
    if (meta) {
      if (meta.todoFor?.includes(ctx.impl)) {
        it.todo(name);
        continue;
      }
      if (meta.skipFor?.includes(ctx.impl)) {
        it.skip(name, () => {});
        continue;
      }
    }
    const resolved = resolveOkExpected(ctx.impl, expected, byImpl);
    if (resolved.skipped) {
      it.skip(name, () => {});
      continue;
    }
    it(name, () => {
      tester.assertExecutionOk(code, resolved.value, opts);
    });
  }
}

interface NormalizedOkCase<T> {
  code: string;
  expected: T | undefined;
  byImpl: PerImpl<T | undefined> | undefined;
  meta: RowMeta | undefined;
}

function normalizeOkCase<T extends I.JSValue>(
  row: OkCase<T>,
): NormalizedOkCase<T> {
  if (typeof row === "string") {
    return { code: row, expected: undefined, byImpl: undefined, meta: undefined };
  }
  if (Array.isArray(row)) {
    return {
      code: row[0],
      expected: row[1],
      byImpl: undefined,
      meta: undefined,
    };
  }
  return {
    code: row.code,
    expected: row.expected,
    byImpl: row.expectedByImpl,
    meta: row,
  };
}

function resolveOkExpected<T>(
  impl: ImplTag,
  expected: T | undefined,
  byImpl: PerImpl<T | undefined> | undefined,
): { skipped: boolean; value: T | undefined } {
  if (byImpl !== undefined) {
    if (impl in byImpl) {
      return { skipped: false, value: byImpl[impl] };
    }
    if (expected === undefined) {
      // No entry and no shared expectation — the divergence is not pinned
      // for this impl; skip rather than let any result pass.
      return { skipped: true, value: undefined };
    }
    return { skipped: false, value: expected };
  }
  return { skipped: false, value: expected };
}
