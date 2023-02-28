import {
  assert,
  assertEquals,
  AssertionError,
  equal,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.178.0/testing/bdd.ts";
import { Unreachable } from "../../errors.ts";
import { RuntimeValueTypes } from "./evaluated_values.ts";

import { execute } from "./execute.ts";
import { RuntimeError, RuntimeError_TypeMismatch } from "./runtime_errors.ts";

export function assertNumber(n: unknown): number {
  assertEquals(typeof n, "number");
  return n as number;
}

export function assertNumberArray(arr: unknown): number[] {
  assert(Array.isArray(arr));
  for (const [i, item] of (arr as Array<unknown>).entries()) {
    assertEquals(typeof item, "number", `arr[${i}]`);
  }
  return arr as number[];
}

export function assertExecutionOk(
  code: string,
  expectedResult: unknown,
  msg?: string,
) {
  const actualResult = execute(code);
  if (equal(actualResult, expectedResult)) return;

  if (!msg) {
    const expectedResultJSON = JSON.stringify(expectedResult);
    if (actualResult instanceof RuntimeError) {
      msg =
        `${code} => 运行时错误：「${actualResult.message}」!= ${expectedResultJSON}`;
    } else {
      msg = `${code} => ${
        JSON.stringify(actualResult)
      } != ${expectedResultJSON}`;
    }
  }
  throw new AssertionError(msg);
}

export function assertExecutionThrows(
  code: string,
  expectedError: string | Error,
  msg?: string,
) {
  let errorToThrow: AssertionError | undefined = undefined;
  try {
    const actualResult = execute("-+1");
    if (!msg) {
      msg = `${code} => ${actualResult}, did not throw`;
    }
    errorToThrow = new AssertionError(msg);
  } catch (e) {
    if (e instanceof Error) {
      if (typeof expectedError === "string") {
        if (expectedError != e.message) {
          if (!msg) {
            msg = `${code} throws ${JSON.stringify(e.message)}, not "${
              JSON.stringify(expectedError)
            }"`;
          }
          errorToThrow = new AssertionError(msg);
        }
      } else {
        if (!equal(expectedError, e)) {
          if (!msg) {
            msg = `${code} throws ${JSON.stringify(e.message)}, not "${
              JSON.stringify(expectedError.message)
            }"`;
          }
          errorToThrow = new AssertionError(msg);
        }
      }
    } else {
      errorToThrow = new Unreachable();
    }
  }

  if (errorToThrow) {
    throw errorToThrow;
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
      [["1", "true"], "number"],
      [["true", "1"], "number"],
      [["[1]", "true"], "list"],
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
      [["1", "true"], "boolean"],
      [["true", "1"], "boolean"],
      [["[1]", "1"], "list"],
    ]);
  });
}

function unaryOperatorOnlyAccepts(
  op: string,
  expected: RuntimeValueTypes,
  table: [string, RuntimeValueTypes][],
) {
  for (const [i, [rightValue, rightType]] of table.entries()) {
    const code = `${op}${rightValue}`;
    it(`case ${i + 1}: ${code} => RuntimeError_TypeMismatch`, () => {
      const result = execute(code);
      assertEquals(
        result,
        new RuntimeError_TypeMismatch(expected, rightType),
      );
    });
  }
}

function binaryOperatorOnlyAccepts(
  op: string,
  expected: RuntimeValueTypes,
  table: [[string, string], RuntimeValueTypes][],
) {
  for (
    const [i, [[leftValue, rightValue], mismatchedType]] of table
      .entries()
  ) {
    const code = `${leftValue}${op}${rightValue}`;
    it(`case ${i + 1}: ${code} => RuntimeError_TypeMismatch`, () => {
      const result = execute(code);
      assertEquals(
        result,
        new RuntimeError_TypeMismatch(expected, mismatchedType),
      );
    });
  }
}
