import crypto from "node:crypto";

import { assert, describe, it } from "vitest";
import AssertionError from "assertion-error";

import { inspect } from "util";

import { Unreachable } from "@dicexp/errors";

import {
  EvaluationOptions,
  EvaluationResult,
  Evaluator,
  ExecutionRestrictions,
  JSValue,
} from "@dicexp/interface";

import {
  createRuntimeError,
  RuntimeError,
} from "@dicexp/naive-evaluator-runtime/runtime-errors";
import { ValueTypeName } from "@dicexp/naive-evaluator-runtime/values";

export interface EvaluationOptionsForTest {
  parse?: {};
  execution?: {
    seed?: number;
    restrictions?: ExecutionRestrictions;
  };
}

export class EvaluationTester {
  constructor(
    private readonly evaluator: Evaluator,
  ) {}

  evaluate(
    code: string,
    opts?: EvaluationOptionsForTest,
  ): EvaluationResult {
    const realOpts: EvaluationOptions = {
      parse: {
        ...opts?.parse,
      },
      execution: {
        seed: crypto.randomBytes(4).readUInt32BE(0),
        ...opts?.execution,
      },
    };
    return this.evaluator.evaluate(code, realOpts);
  }

  /**
   * @param expectedResult 若为 undefined，代表只要结果没有错误就算通过。
   */
  assertExecutionOk(
    code: string,
    expectedResult: unknown | undefined,
    opts?: EvaluationOptionsForTest,
  ): JSValue {
    const result = this.evaluate(code, opts);
    if (result[0] === "ok") {
      const value = result[1];
      if (value === null) throw new Unreachable();
      if (expectedResult === undefined) return value;
      if (deepEqual(value, expectedResult)) return value;
    }

    let msg: string;
    const msgRest = expectedResult === undefined
      ? ""
      : `!= ${inspect(expectedResult)}`;
    if (result[0] === "error") {
      msg = `${code} => 运行时错误：` +
        `「${result[2].message}」${msgRest}`;
    } else { // result[0] === "ok"
      const actualResultInspected = inspect(result[1]);
      msg = `${code} => ${actualResultInspected} ${msgRest}`;
    }
    throw new AssertionError(msg);
  }

  assertExecutionRuntimeError(
    code: string,
    expectedError: string | RuntimeError,
    opts?: EvaluationOptionsForTest,
  ) {
    const result = this.evaluate(code, opts);
    if (result[0] === "ok") {
      const actualResultInspected = inspect(result[1]);
      throw new AssertionError(
        `${code} => ${actualResultInspected}, did not return error "${expectedError}`,
      );
    }
    // result[0] === "error" && result[1] === "runtime"
    const err = result[2];

    if (typeof expectedError === "string") {
      if (err.message === expectedError) return;
      throw new AssertionError(
        `\`${code}\` returned error` +
          ` "${err.message}", not "${expectedError}"`,
      );
    } else {
      assert.deepEqual(err, expectedError);
    }
  }

  unaryOperatorOnlyAcceptsBoolean(
    op: string,
    opts?: EvaluationOptionsForTest,
  ) {
    describe("只能用于布尔", () => {
      this.unaryOperatorOnlyAccepts(op, "boolean", [
        ["1", "integer"],
        ["[1]", "list"],
      ], opts);
    });
  }

  binaryOperatorOnlyAcceptsBoolean(
    op: string,
    opts?: EvaluationOptionsForTest,
  ) {
    describe("只能用于布尔", () => {
      this.binaryOperatorOnlyAccepts(op, "boolean", [
        [["1", "true"], "integer", 1],
        [["true", "1"], "integer", 2],
        [["[1]", "true"], "list", 1],
      ], opts);
    });
  }

  unaryOperatorOnlyAcceptsNumbers(
    op: string,
    opts?: EvaluationOptionsForTest,
  ) {
    describe("只能用于数字", () => {
      this.unaryOperatorOnlyAccepts(op, "integer", [
        ["true", "boolean"],
        ["[1]", "list"],
      ], opts);
    });
  }

  binaryOperatorOnlyAcceptsNumbers(
    op: string,
    opts?: EvaluationOptionsForTest,
  ) {
    describe("只能用于数字", () => {
      this.binaryOperatorOnlyAccepts(op, "integer", [
        [["1", "true"], "boolean", 2],
        [["true", "1"], "boolean", 1],
        [["[1]", "1"], "list", 1],
      ], opts);
    });
  }

  private unaryOperatorOnlyAccepts(
    op: string,
    expected: ValueTypeName,
    table: [string, ValueTypeName][],
    opts?: EvaluationOptionsForTest,
  ) {
    for (const [i, [rightValue, rightType]] of table.entries()) {
      const code = `${op}(${rightValue})`;
      it(`case ${i + 1}: ${code} => RuntimeError_CallArgumentTypeMismatch`, () => {
        this.assertExecutionRuntimeError(
          code,
          createRuntimeError.callArgumentTypeMismatch(1, expected, rightType),
          opts,
        );
      });
    }
  }

  private binaryOperatorOnlyAccepts(
    op: string,
    expected: ValueTypeName,
    table: [[string, string], ValueTypeName, number][],
    opts?: EvaluationOptionsForTest,
  ) {
    for (
      const [i, [[leftValue, rightValue], wrongType, pos]] of table
        .entries()
    ) {
      const code = `(${leftValue})${op}(${rightValue})`;
      it(`case ${i + 1}: ${code} => RuntimeError_CallArgumentTypeMismatch`, () => {
        this.assertExecutionRuntimeError(
          code,
          createRuntimeError.callArgumentTypeMismatch(pos, expected, wrongType),
          opts,
        );
      });
    }
  }

  assertResultsAreRandom(
    code: string,
    opts?: EvaluationOptionsForTest,
  ) {
    const results = Array(10).fill(null)
      .map((_) => assertNumber(this.evaluate(code, opts)));
    assert(new Set(results).size > 1);
  }

  theyAreOk<T extends JSValue = JSValue>(
    table: ([string, T] | string)[],
    opts?: EvaluationOptionsForTest,
  ) {
    for (const [i, row] of table.entries()) {
      let code: string, expected: unknown | undefined;
      if (typeof row === "string") {
        code = row;
        expected = undefined;
      } else {
        [code, expected] = row;
      }
      it(`case ${i + 1}: ${code}`, () => {
        this.assertExecutionOk(code, expected, opts);
      });
    }
  }
}

export function assertNumber(result: EvaluationResult): number {
  assert(result[0] === "ok");

  assert.deepEqual(typeof result[1], "number");
  return result[1] as number;
}

export function assertNumberArray(result: EvaluationResult): number[] {
  assert(result[0] === "ok");

  assert(Array.isArray(result[1]));
  for (const [i, item] of (result[1] as Array<unknown>).entries()) {
    assert.deepEqual(typeof item, "number", `arr[${i}]`);
  }
  return result[1] as number[];
}

function deepEqual<T>(actual: T, expected: T, message?: string): boolean {
  try {
    assert.deepEqual(actual, expected, message);
  } catch (e) {
    if (!(e instanceof AssertionError)) throw new Unreachable();
    return false;
  }
  return true;
}
