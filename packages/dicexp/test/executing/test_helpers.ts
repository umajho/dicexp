import { assert, describe, it } from "vitest";
import { AssertionError } from "assertion-error";

import { inspect } from "util";

import { parse, ParseOptions } from "../../src/parsing/mod";

import { RuntimeError, Scope, ValueTypeName } from "@dicexp/runtime/values";
import {
  execute,
  ExecuteOptions,
  ExecutionResult,
  JSValue,
} from "../../src/executing/mod";
import {
  runtimeError_callArgumentTypeMismatch,
  RuntimeErrorFromArgument,
} from "@dicexp/runtime/errors";
import { Unreachable } from "@dicexp/errors";
import * as builtins from "@dicexp/builtins/internal";
import { asScope } from "@dicexp/runtime/regular-functions";

const testScopeCollection = ((): Scope => {
  const pickedFunctions: string[] = [
    ...["count/2", "sum/1", "sort/1", "append/2", "at/2"],
    ...["map/2", "filter/2", "head/1", "tail/1", "zip/2", "zipWith/3"],
  ];
  const pickedScope: Scope = {};
  for (const picked of pickedFunctions) {
    if (!builtins.functionScope[picked]) {
      throw new Unreachable(
        `"测试用的函数 \`${picked}\` 不存在于标准作用域中"`,
      );
    }
    pickedScope[picked] = builtins.functionScope[picked];
  }
  return asScope([builtins.operatorScope, pickedScope]);
})();

type ExecuteOptionsForTest = Omit<ExecuteOptions, "topLevelScope"> & {
  topLevelScope?: Scope;
};
export function evaluateForTest(
  code: string,
  executeOpts?: ExecuteOptionsForTest,
  parseOpts?: ParseOptions,
): ExecutionResult {
  const parseResult = parse(code, parseOpts);
  if (parseResult[0] === "error") {
    throw new Unreachable(`解析错误：${parseResult[1].message}`);
  }
  // parseResult[0] === "ok"
  return execute(parseResult[1], {
    ...executeOpts,
    topLevelScope: executeOpts?.topLevelScope ?? testScopeCollection,
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

export function assertExecutionOk(
  code: string,
  expectedResult?: unknown,
  opts?: ExecuteOptionsForTest,
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
  opts?: ExecuteOptionsForTest & { fromArgument?: boolean },
) {
  const fromArgument = !!opts?.fromArgument;
  if (opts) {
    delete opts.fromArgument;
  }

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
    if (fromArgument) {
      if (!(err instanceof RuntimeErrorFromArgument)) {
        throw new AssertionError(
          `the error returned by \`${code}\` is not RuntimeErrorFromArgument`,
        );
      }
      if (err.originalError.message === expectedError) return;
    } else if (err.message === expectedError) return;
    throw new AssertionError(
      `\`${code}\` returned error` +
        (fromArgument ? " (from argument)" : "") +
        ` "${err.message}", not "${expectedError}"`,
    );
  } else {
    expectedError = fromArgument
      ? new RuntimeErrorFromArgument(expectedError)
      : expectedError;
    assert.deepEqual(err, expectedError);
  }
}

export function unaryOperatorOnlyAcceptsBoolean(op: string) {
  describe("只能用于布尔", () => {
    unaryOperatorOnlyAccepts(op, "boolean", [
      ["1", "integer"],
      ["[1]", "list"],
    ]);
  });
}

export function binaryOperatorOnlyAcceptsBoolean(op: string) {
  describe("只能用于布尔", () => {
    binaryOperatorOnlyAccepts(op, "boolean", [
      [["1", "true"], "integer", 1],
      [["true", "1"], "integer", 2],
      [["[1]", "true"], "list", 1],
    ]);
  });
}

export function unaryOperatorOnlyAcceptsNumbers(op: string) {
  describe("只能用于数字", () => {
    unaryOperatorOnlyAccepts(op, "integer", [
      ["true", "boolean"],
      ["[1]", "list"],
    ]);
  });
}

export function binaryOperatorOnlyAcceptsNumbers(op: string) {
  describe("只能用于数字", () => {
    binaryOperatorOnlyAccepts(op, "integer", [
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
        runtimeError_callArgumentTypeMismatch(1, expected, rightType),
        { fromArgument: true },
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
        runtimeError_callArgumentTypeMismatch(pos, expected, wrongType),
        { fromArgument: true },
      );
    });
  }
}

export function assertResultsAreRandom(code: string) {
  const results = Array(10).fill(null)
    .map((_) => assertNumber(evaluateForTest(code)));
  assert(new Set(results).size > 1);
}

export function theyAreOk<T extends JSValue = JSValue>(
  table: ([string, T] | string)[],
  opts?: ExecuteOptionsForTest,
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
