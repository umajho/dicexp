import {
  assert,
  assertEquals,
  AssertionError,
  equal,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.178.0/testing/bdd.ts";

import { ValueTypeName } from "./values.ts";
import { execute, ExecutionResult } from "./execute.ts";
import {
  RuntimeError,
  RuntimeError_CallArgumentTypeMismatch,
} from "./runtime_errors.ts";
import { JSValue } from "./runtime.ts";

export function assertNumber(result: ExecutionResult): number {
  assertEquals(result.runtimeError, null);

  assertEquals(typeof result.value, "number");
  return result.value as number;
}

export function assertNumberArray(result: ExecutionResult): number[] {
  assertEquals(result.runtimeError, null);

  assert(Array.isArray(result.value));
  for (const [i, item] of (result.value as Array<unknown>).entries()) {
    assertEquals(typeof item, "number", `arr[${i}]`);
  }
  return result.value as number[];
}

export function assertExecutionOk(
  code: string,
  expectedResult?: unknown,
) {
  const result = execute(code);
  if (!result.runtimeError) {
    if (expectedResult === undefined) return;
    if (equal(result.value, expectedResult)) return;
  }

  const expectedResultInspected = Deno.inspect(expectedResult);
  let msg: string;
  if (result.runtimeError) {
    msg = `${code} => 运行时错误：` +
      `「${result.runtimeError.message}」!= ${expectedResultInspected}`;
  } else {
    const actualResultInspected = Deno.inspect(result.value);
    msg = `${code} => ${actualResultInspected} != ${expectedResultInspected}`;
  }
  throw new AssertionError(msg);
}

export function assertExecutionRuntimeError(
  code: string,
  expectedError: string | RuntimeError,
) {
  const result = execute(code);
  if (!result.runtimeError) {
    const actualResultInspected = Deno.inspect(result.value);
    throw new AssertionError(
      `${code} => ${actualResultInspected}, did not return error "${expectedError}`,
    );
  }

  if (expectedError instanceof RuntimeError) {
    assertEquals(result.runtimeError, expectedError);
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
