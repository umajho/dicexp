import {
  assert,
  assertEquals,
  AssertionError,
  assertThrows,
  equal,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { it } from "https://deno.land/std@0.178.0/testing/bdd.ts";
import { Unreachable } from "../../errors.ts";

import { execute } from "./execute.ts";

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
    msg = `${code} => ${JSON.stringify(actualResult)} != ${
      JSON.stringify(expectedResult)
    }`;
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
  it("只能用于布尔", () => {
    assertThrows(() => execute(`${op}1`), "TODO: error");
    assertThrows(() => execute(`${op}[1]`), "TODO: error");
  });
}

export function binaryOperatorOnlyAcceptsBoolean(op: string) {
  it("只能用于布尔", () => {
    assertThrows(() => execute(`1${op}true`), "TODO: error");
    assertThrows(() => execute(`true${op}1`), "TODO: error");
    assertThrows(() => execute(`[1] ${op} true`), "TODO: error");
  });
}

export function unaryOperatorOnlyAcceptsNumbers(op: string) {
  it("只能用于数字", () => {
    assertThrows(() => execute(`${op}true`), "TODO: error");
    assertThrows(() => execute(`${op}[1]`), "TODO: error");
  });
}

export function binaryOperatorOnlyAcceptsNumbers(op: string) {
  it("只能用于数字", () => {
    assertThrows(() => execute(`1${op}true`), "TODO: error");
    assertThrows(() => execute(`true${op}1`), "TODO: error");
    assertThrows(() => execute(`[1] ${op} 1`), "TODO: error");
  });
}
