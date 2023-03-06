import {
  assert,
  assertEquals,
  AssertionError,
  equal,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.178.0/testing/bdd.ts";

import { ValueTypeName } from "./values.ts";
import { execute } from "./execute.ts";
import {
  RuntimeError,
  RuntimeError_CallArgumentTypeMismatch,
} from "./runtime_errors.ts";
import { EitherJSValueOrError } from "./runtime.ts";

export function assertNumber(x: EitherJSValueOrError): number {
  const [result, err] = x;
  assertEquals(err, null);

  assertEquals(typeof result, "number");
  return result as number;
}

export function assertNumberArray(x: EitherJSValueOrError): number[] {
  const [result, err] = x;
  assertEquals(err, null);

  assert(Array.isArray(result));
  for (const [i, item] of (result as Array<unknown>).entries()) {
    assertEquals(typeof item, "number", `arr[${i}]`);
  }
  return result as number[];
}

export function assertExecutionOk(
  code: string,
  expectedResult: unknown,
) {
  const [actualResult, err] = execute(code);
  if (!err && equal(actualResult, expectedResult)) return;

  const expectedResultInspected = Deno.inspect(expectedResult);
  let msg: string;
  if (err) {
    msg = `${code} => 运行时错误：` +
      `「${err.message}」!= ${expectedResultInspected}`;
  } else {
    const actualResultInspected = Deno.inspect(actualResult);
    msg = `${code} => ${actualResultInspected} != ${expectedResultInspected}`;
  }
  throw new AssertionError(msg);
}

export function assertExecutionRuntimeError(
  code: string,
  expectedError: string | RuntimeError,
) {
  const [actualResult, err] = execute(code);
  if (!err) {
    const actualResultInspected = Deno.inspect(actualResult);
    throw new AssertionError(
      `${code} => ${actualResultInspected}, did not return error "${expectedError}`,
    );
  }

  if (expectedError instanceof RuntimeError) {
    assertEquals(err, expectedError);
  } else {
    if (err.message === expectedError) return;
    throw new AssertionError(
      `${code} returned error "${err.message}", not "${expectedError}"`,
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
