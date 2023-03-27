import { assert, describe, it } from "vitest";
import { AssertionError } from "assertion-error";

import { inspect } from "util";

import { parse, type ParseOptions } from "@dicexp/parsing";

import { ValueTypeName } from "../src/values";
import { execute, ExecuteOptions, ExecutionResult } from "../src/execute";
import {
  RuntimeError,
  RuntimeError_CallArgumentTypeMismatch,
} from "../src/runtime_errors";
import { JSValue } from "../src/runtime";
import { Unreachable } from "../src/errors";

export function evaluate(
  code: string,
  opts: ExecuteOptions & { parseOpts?: ParseOptions } = {},
): ExecutionResult {
  const node = parse(code, opts.parseOpts);
  return execute(node, opts);
}

export function assertNumber(result: ExecutionResult): number {
  assert.deepEqual(result.runtimeError, null);

  assert.deepEqual(typeof result.value, "number");
  return result.value as number;
}

export function assertNumberArray(result: ExecutionResult): number[] {
  assert.deepEqual(result.runtimeError, null);

  assert(Array.isArray(result.value));
  for (const [i, item] of (result.value as Array<unknown>).entries()) {
    assert.deepEqual(typeof item, "number", `arr[${i}]`);
  }
  return result.value as number[];
}

export function assertExecutionOk(
  code: string,
  expectedResult?: unknown,
): JSValue {
  const result = evaluate(code);
  if (!result.runtimeError) {
    if (result.value === null) throw new Unreachable();
    if (expectedResult === undefined) return result.value!;
    if (deepEqual(result.value, expectedResult)) return result.value!;
  }

  const expectedResultInspected = inspect(expectedResult);
  let msg: string;
  if (result.runtimeError) {
    msg = `${code} => 运行时错误：` +
      `「${result.runtimeError.message}」!= ${expectedResultInspected}`;
  } else {
    const actualResultInspected = inspect(result.value);
    msg = `${code} => ${actualResultInspected} != ${expectedResultInspected}`;
  }
  throw new AssertionError(msg);
}

export function assertExecutionRuntimeError(
  code: string,
  expectedError: string | RuntimeError,
) {
  const result = evaluate(code);
  if (!result.runtimeError) {
    const actualResultInspected = inspect(result.value);
    throw new AssertionError(
      `${code} => ${actualResultInspected}, did not return error "${expectedError}`,
    );
  }

  if (expectedError instanceof RuntimeError) {
    assert.deepEqual(result.runtimeError, expectedError);
  } else {
    if (result.runtimeError.message === expectedError) return;
    throw new AssertionError(
      `${code} returned error "${result.runtimeError.message}", not "${expectedError}"`,
    );
  }
}

export function unaryOperatorOnlyAcceptsBoolean(op: string) {
  describe("只能用于布尔", () => {
    unaryOperatorOnlyAccepts(op, "boolean", [
      ["1", "number"],
      ["[1]", "list"],
    ]);
  });
}

export function binaryOperatorOnlyAcceptsBoolean(op: string) {
  describe("只能用于布尔", () => {
    binaryOperatorOnlyAccepts(op, "boolean", [
      [["1", "true"], "number", 1],
      [["true", "1"], "number", 2],
      [["[1]", "true"], "list", 1],
    ]);
  });
}

export function unaryOperatorOnlyAcceptsNumbers(op: string) {
  describe("只能用于数字", () => {
    unaryOperatorOnlyAccepts(op, "number", [
      ["true", "boolean"],
      ["[1]", "list"],
    ]);
  });
}

export function binaryOperatorOnlyAcceptsNumbers(op: string) {
  describe("只能用于数字", () => {
    binaryOperatorOnlyAccepts(op, "number", [
      [["1", "true"], "boolean", 2],
      [["true", "1"], "boolean", 1],
      [["[1]", "1"], "list", 1],
    ]);
  });
}

function unaryOperatorOnlyAccepts(
  op: string,
  expected: ValueTypeName,
  table: [string, ValueTypeName][],
) {
  for (const [i, [rightValue, rightType]] of table.entries()) {
    const code = `${op}(${rightValue})`;
    it(`case ${i + 1}: ${code} => RuntimeError_CallArgumentTypeMismatch`, () => {
      assertExecutionRuntimeError(
        code,
        new RuntimeError_CallArgumentTypeMismatch(1, expected, rightType),
      );
    });
  }
}

function binaryOperatorOnlyAccepts(
  op: string,
  expected: ValueTypeName,
  table: [[string, string], ValueTypeName, number][],
) {
  for (
    const [i, [[leftValue, rightValue], wrongType, pos]] of table
      .entries()
  ) {
    const code = `(${leftValue})${op}(${rightValue})`;
    it(`case ${i + 1}: ${code} => RuntimeError_CallArgumentTypeMismatch`, () => {
      assertExecutionRuntimeError(
        code,
        new RuntimeError_CallArgumentTypeMismatch(pos, expected, wrongType),
      );
    });
  }
}

export function theyAreOk<T extends JSValue = JSValue>(table: [string, T][]) {
  for (const [i, [code, expected]] of table.entries()) {
    it(`case ${i + 1}: ${code}`, () => {
      assertExecutionOk(code, expected);
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
