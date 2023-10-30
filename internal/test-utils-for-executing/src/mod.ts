import { assert, describe, it } from "vitest";
import AssertionError from "assertion-error";

import { inspect } from "util";

import {
  execute,
  ExecuteOptions,
  ExecutionResult,
  JSValue,
  parse,
  ParseOptions,
} from "dicexp/internal";
import {
  createRuntimeError,
  RuntimeError,
} from "@dicexp/runtime/runtime-errors";
import { ValueTypeName } from "@dicexp/runtime/values";
import { Unreachable } from "@dicexp/errors";

type ExecuteOptionsForTest = ExecuteOptions;
export function evaluateForTest(
  code: string,
  executeOpts: ExecuteOptionsForTest,
  parseOpts?: ParseOptions,
): ExecutionResult {
  const parseResult = parse(code, parseOpts);
  if (parseResult[0] === "error") {
    throw new Unreachable(`解析错误：${parseResult[1].message}`);
  }
  // parseResult[0] === "ok"
  return execute(parseResult[1], {
    ...executeOpts,
    topLevelScope: executeOpts.topLevelScope,
  });
}

export function assertNumber(result: ExecutionResult): number {
  assert(result[0] === "ok");

  assert.deepEqual(typeof result[1], "number");
  return result[1] as number;
}

export function assertNumberArray(result: ExecutionResult): number[] {
  assert(result[0] === "ok");

  assert(Array.isArray(result[1]));
  for (const [i, item] of (result[1] as Array<unknown>).entries()) {
    assert.deepEqual(typeof item, "number", `arr[${i}]`);
  }
  return result[1] as number[];
}

/**
 * @param expectedResult 若为 undefined，代表只要结果没有错误就算通过。
 */
export function assertExecutionOk(
  code: string,
  expectedResult: unknown | undefined,
  opts: ExecuteOptionsForTest,
): JSValue {
  const result = evaluateForTest(code, opts);
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
      `「${result[1].message}」${msgRest}`;
  } else { // result[0] === "ok"
    const actualResultInspected = inspect(result[1]);
    msg = `${code} => ${actualResultInspected} ${msgRest}`;
  }
  throw new AssertionError(msg);
}

export function assertExecutionRuntimeError(
  code: string,
  expectedError: string | RuntimeError,
  opts: ExecuteOptionsForTest,
) {
  const result = evaluateForTest(code, opts);
  if (result[0] === "ok") {
    const actualResultInspected = inspect(result[1]);
    throw new AssertionError(
      `${code} => ${actualResultInspected}, did not return error "${expectedError}`,
    );
  }
  // result[0] === "error"
  const err = result[1];

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

export function unaryOperatorOnlyAcceptsBoolean(
  op: string,
  opts: ExecuteOptionsForTest,
) {
  describe("只能用于布尔", () => {
    unaryOperatorOnlyAccepts(op, "boolean", [
      ["1", "integer"],
      ["[1]", "list"],
    ], opts);
  });
}

export function binaryOperatorOnlyAcceptsBoolean(
  op: string,
  opts: ExecuteOptionsForTest,
) {
  describe("只能用于布尔", () => {
    binaryOperatorOnlyAccepts(op, "boolean", [
      [["1", "true"], "integer", 1],
      [["true", "1"], "integer", 2],
      [["[1]", "true"], "list", 1],
    ], opts);
  });
}

export function unaryOperatorOnlyAcceptsNumbers(
  op: string,
  opts: ExecuteOptionsForTest,
) {
  describe("只能用于数字", () => {
    unaryOperatorOnlyAccepts(op, "integer", [
      ["true", "boolean"],
      ["[1]", "list"],
    ], opts);
  });
}

export function binaryOperatorOnlyAcceptsNumbers(
  op: string,
  opts: ExecuteOptionsForTest,
) {
  describe("只能用于数字", () => {
    binaryOperatorOnlyAccepts(op, "integer", [
      [["1", "true"], "boolean", 2],
      [["true", "1"], "boolean", 1],
      [["[1]", "1"], "list", 1],
    ], opts);
  });
}

function unaryOperatorOnlyAccepts(
  op: string,
  expected: ValueTypeName,
  table: [string, ValueTypeName][],
  opts: ExecuteOptionsForTest,
) {
  for (const [i, [rightValue, rightType]] of table.entries()) {
    const code = `${op}(${rightValue})`;
    it(`case ${i + 1}: ${code} => RuntimeError_CallArgumentTypeMismatch`, () => {
      assertExecutionRuntimeError(
        code,
        createRuntimeError.callArgumentTypeMismatch(1, expected, rightType),
        opts,
      );
    });
  }
}

function binaryOperatorOnlyAccepts(
  op: string,
  expected: ValueTypeName,
  table: [[string, string], ValueTypeName, number][],
  opts: ExecuteOptionsForTest,
) {
  for (
    const [i, [[leftValue, rightValue], wrongType, pos]] of table
      .entries()
  ) {
    const code = `(${leftValue})${op}(${rightValue})`;
    it(`case ${i + 1}: ${code} => RuntimeError_CallArgumentTypeMismatch`, () => {
      assertExecutionRuntimeError(
        code,
        createRuntimeError.callArgumentTypeMismatch(pos, expected, wrongType),
        opts,
      );
    });
  }
}

export function assertResultsAreRandom(
  code: string,
  opts: ExecuteOptionsForTest,
) {
  const results = Array(10).fill(null)
    .map((_) => assertNumber(evaluateForTest(code, opts)));
  assert(new Set(results).size > 1);
}

export function theyAreOk<T extends JSValue = JSValue>(
  table: ([string, T] | string)[],
  opts: ExecuteOptionsForTest,
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
      assertExecutionOk(code, expected, opts);
    });
  }
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
