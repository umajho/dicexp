import { describe, it } from "vitest";

import { ValueTypeName } from "@dicexp/naive-evaluator-runtime/values";
import {
  createRuntimeError,
  RuntimeError,
} from "@dicexp/naive-evaluator-runtime/runtime-errors";

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
import { expectedRuntimeErrorFor, theyAreOk } from "./rows";

/**
 * The base operators suite, extracted from
 * `packages/naive-evaluator-builtins/test/base-operators.test.ts`, plus the
 * operator type-check tables moved out of `EvaluationTester` (mod.ts) so
 * rows can carry divergence data.
 */
export function defineBaseOperatorsSuite(ctx: SuiteContext): void {
  describe("base/operators", () => {
    describe("or/2", () => {
      const tester = ctx.makeTesterFor(["or/2"]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`true or true`, true],
          [String.raw`true or false`, true],
          [String.raw`false or true`, true],
          [String.raw`false or false`, false],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        binaryOperatorOnlyAcceptsBoolean(ctx, tester, "or", [
          { operands: ["1", "true"], wrongType: "integer", pos: 1 },
          {
            // compat.md §1（标签 “div1-short-circuit”）：nova 的 `or` 在左侧
            // 为 `true` 时不会求值右侧，`(true) or 1` 得到 `true` 而非在第
            // 2 个参数处报错。
            operands: ["true", "1"],
            wrongType: "integer",
            pos: 2,
            tags: ["div1-short-circuit"],
            outcome: {
              naive: {
                error: createRuntimeError.callArgumentTypeMismatch(
                  2,
                  "boolean",
                  "integer",
                ),
              },
              nova: { ok: true },
            },
          },
          { operands: ["[1]", "true"], wrongType: "list", pos: 1 },
        ]);
      });
    });
    describe("and/2", () => {
      const tester = ctx.makeTesterFor(["and/2"]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`true and true`, true],
          [String.raw`true and false`, false],
          [String.raw`false and true`, false],
          [String.raw`false and false`, false],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        binaryOperatorOnlyAcceptsBoolean(ctx, tester, "and");
      });
    });
    describe("==/2, !=/2", () => {
      describe("正确使用时", () => {
        const tester = ctx.makeTesterFor(["==/2", "!=/2"]);
        theyAreOk(ctx, tester, [
          [String.raw`true == true`, true],
          [String.raw`true != true`, false],
          [String.raw`1 == 1`, true],
          [String.raw`1 != 1`, false],
          [String.raw`1 == 2`, false],
          [String.raw`1 != 2`, true],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        const tester = ctx.makeTesterFor(["==/2", "!=/2", "-/1"]);
        describe("相同类型之间比较是否相等", () => {
          const table = [
            ["1", "1", true],
            ["-1", "-1", true],
            ["1", "-1", false],
            ["false", "false", true],
          ];
          for (const [l, r, eqExpected] of table) {
            const eqCode = `${l} == ${r}`;
            it(`${eqCode} => ${eqExpected}`, () => {
              tester.assertExecutionOk(eqCode, eqExpected);
            });
            const neCode = `${l} != ${r}`;
            it(`${neCode} => ${!eqExpected}`, () => {
              tester.assertExecutionOk(neCode, !eqExpected);
            });
          }
        });
        describe("不同类型之间不能相互比较", () => {
          const table = [
            ["1", "true"],
            ["0", "false"],
          ];
          for (const [l, r] of table) {
            for (const op of ["==", "!="]) {
              const code = `${l} ${op} ${r}`;
              it(`${l} ${op} ${r} => error`, () => {
                tester.assertExecutionRuntimeError(
                  code,
                  `操作 “${op}” 非法：两侧操作数的类型不相同`,
                );
              });
            }
          }
        });
      });
    });
    describe("</2, >/2, <=/2, >=/2", () => {
      describe("正确使用时", () => {
        const tester = ctx.makeTesterFor([
          "</2",
          ">/2",
          "<=/2",
          ">=/2",
        ]);
        theyAreOk(ctx, tester, [
          [String.raw`0 < 1`, true],
          [String.raw`0 <= 1`, true],
          [String.raw`0 > 1`, false],
          [String.raw`0 >= 1`, false],
          [String.raw`0 < 0`, false],
          [String.raw`0 <= 0`, true],
          [String.raw`0 > 0`, false],
          [String.raw`0 >= 0`, true],
          [String.raw`1 < 0`, false],
          [String.raw`1 <= 0`, false],
          [String.raw`1 > 0`, true],
          [String.raw`1 >= 0`, true],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        const tester = ctx.makeTesterFor([
          "</2",
          ">/2",
          "<=/2",
          ">=/2",
          "-/1",
        ]);
        it("比较两数大小", () => {
          const table = [
            ["1", "<", "2"],
            ["2", ">", "1"],
            ["1", "==", "1"],
            ["-1", ">", "-2"],
          ];
          for (const [l, relation, r] of table) {
            tester.assertExecutionOk(`${l} < ${r}`, relation == "<");
            tester.assertExecutionOk(`${l} > ${r}`, relation == ">");
            tester.assertExecutionOk(
              `${l} <= ${r}`,
              relation == "<" || relation == "==",
            );
            tester.assertExecutionOk(
              `${l} >= ${r}`,
              relation == ">" || relation == "==",
            );
          }
        });

        binaryOperatorOnlyAcceptsNumbers(ctx, tester, "<");
        binaryOperatorOnlyAcceptsNumbers(ctx, tester, ">");
        binaryOperatorOnlyAcceptsNumbers(ctx, tester, "<=");
        binaryOperatorOnlyAcceptsNumbers(ctx, tester, ">=");
      });
    });
    describe("~/2, ~/1", () => {
      // 针对运算结果的测试位于 dicexp 库的测试中，因此不在这里重复写这部分测试

      describe("moved from package `dicexp`", () => {
        const tester = ctx.makeTesterFor(["~/2", "~/1"]);
        unaryOperatorOnlyAcceptsNumbers(ctx, tester, "~");
        binaryOperatorOnlyAcceptsNumbers(ctx, tester, "~");
      });
    });
    describe("+/2, -/2", () => {
      describe("正确使用时", () => {
        const tester = ctx.makeTesterFor(["+/2", "-/2"]);
        theyAreOk(ctx, tester, [
          [String.raw`2+3`, 5],
          [String.raw`2-3`, -1],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        const tester = ctx.makeTesterFor(["+/2", "-/2", "-/1"]);
        describe("+/2", () => {
          describe("将两数相加", () => {
            theyAreOk(ctx, tester, [
              ["1+1", 2],
              ["1+-1", 0],
              ["-1+-1", -2],
            ]);
          });
          binaryOperatorOnlyAcceptsNumbers(ctx, tester, "+");
        });
        describe("-/2", () => {
          describe("将两数相减", () => {
            theyAreOk(ctx, tester, [
              ["1-1", 0],
              ["1--1", 2],
              ["-1--1", 0],
            ]);
          });
          binaryOperatorOnlyAcceptsNumbers(ctx, tester, "-");
        });
      });
    });
    describe("+/1, -/1", () => {
      const tester = ctx.makeTesterFor(["+/1", "-/1"]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`+1`, 1],
          [String.raw`-1`, -1],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        describe("+/1", () => {
          describe("让数字保持原状", () => {
            theyAreOk(ctx, tester, [
              ["+1", 1],
              ["+-1", -1],
              ["-+1", -1],
            ]);
          });
          unaryOperatorOnlyAcceptsNumbers(ctx, tester, "+");
        });
        describe("-/1", () => {
          describe("取数字的相反数", () => {
            theyAreOk(ctx, tester, [
              ["-1", -1],
              ["--1", 1],
            ]);
          });
          unaryOperatorOnlyAcceptsNumbers(ctx, tester, "-");
        });
      });
    });
    describe("*/2", () => {
      describe("正确使用时", () => {
        const tester = ctx.makeTesterFor(["*/2"]);
        theyAreOk(ctx, tester, [
          [String.raw`2*3`, 6],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        const tester = ctx.makeTesterFor(["*/2", "-/1"]);
        describe("将两数相乘", () => {
          theyAreOk(ctx, tester, [
            ["10*2", 20],
            ["10*-2", -20],
            ["-1*-1", 1],
          ]);
        });
        binaryOperatorOnlyAcceptsNumbers(ctx, tester, "*");
      });
    });
    describe("///2", () => {
      const tester = ctx.makeTesterFor(["///2", "-/1"]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`2//3`, 0],
          [String.raw`3//3`, 1],
          [String.raw`4//3`, 1],
          [String.raw`(-4)//3`, -1],
          [String.raw`4//(-3)`, -1],
          [String.raw`(-4)//(-3)`, 1],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        describe("将两数相整除", () => {
          theyAreOk(ctx, tester, [
            ["1//2", 0],
            ["2//2", 1],
            ["3//2", 1],
            ["-3//2", -1],
            ["3//-2", -1],
            ["-3//-2", 1],
          ]);
        });
        // div2 note: all rows above use operands within 32 bits, so naive's
        // `| 0` truncation is invisible here — no divergence on these
        // rows. Rows with larger operands would carry
        // "div2-64bit-divmod" with per-impl expected values.
        binaryOperatorOnlyAcceptsNumbers(ctx, tester, "//");
      });
    });
    describe("%/2", () => {
      describe("正确使用时", () => {
        const tester = ctx.makeTesterFor(["%/2"]);
        theyAreOk(ctx, tester, [
          [String.raw`2%3`, 2],
          [String.raw`3%2`, 1],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        const tester = ctx.makeTesterFor(["%/2", "-/1"]);
        describe("将两非负整数取模", () => {
          theyAreOk(ctx, tester, [
            ["1%2", 1],
            ["2%2", 0],
            ["3%2", 1],
          ]);
        });
        it("任何操作数都不能是负数", () => {
          tester.assertExecutionRuntimeError(
            "(-3) % 2",
            "操作 “(-3) % 2” 非法：被除数不能为负数",
          );
          tester.assertExecutionRuntimeError(
            "3 % -2",
            "操作 “3 % -2” 非法：除数必须为正数",
          );
          tester.assertExecutionRuntimeError(
            "(-3)%-2",
            "操作 “(-3) % -2” 非法：被除数不能为负数",
          );
          tester.assertExecutionOk("-(3%2)", -1); // 取模的优先级更高
        });
        // div2 note: as with `//` above — no operand here exceeds 32 bits.
        binaryOperatorOnlyAcceptsNumbers(ctx, tester, "%");
      });
    });
    describe("**/2", () => {
      for (const expOp of ["**", "^"]) {
        const tester = ctx.makeTesterFor(
          expOp === "**"
            ? ["**/2", "-/1"]
            : ["**/2", "^/2", "-/1"],
        );
        describe(`作为 \`${expOp}\``, () => {
          describe("正确使用时", () => {
            theyAreOk(ctx, tester, [
              [String.raw`2${expOp}3`, 8],
              [String.raw`(-2)${expOp}3`, -8],
            ]);
          });
          describe("moved from package `dicexp`", () => {
            describe("执行指数运算", () => {
              theyAreOk(ctx, tester, [
                [`2${expOp}8`, 256],
              ]);
            });

            it("只接受非负数次幂", () => {
              tester.assertExecutionRuntimeError(
                `3 ${expOp} -2`,
                "操作 “3 ** -2” 非法：指数不能为负数",
              );
            });
          });
        });
      }
    });
    describe("d/2, d/1", () => {
      // 情况同 `~/2` 与 `~1`

      describe("moved from package `dicexp`", () => {
        const tester = ctx.makeTesterFor(["d/1"]);
        unaryOperatorOnlyAcceptsNumbers(ctx, tester, "d");
      });
    });
    describe("not/2", () => {
      // NOTE: 原文件即如此命名（实际测试的是 `not/1`）。
      const tester = ctx.makeTesterFor(["not/1"]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`not true`, false],
          [String.raw`not false`, true],
        ]);
      });
      describe("moved from package `dicexp`", () => {
        unaryOperatorOnlyAcceptsBoolean(ctx, tester, "not");
      });
    });
  });
}

/**
 * What an operator call must produce for an implementation.
 */
export type OperatorCallOutcome =
  | { error: string | RuntimeError }
  | { ok: unknown };

/**
 * A "wrong argument type" case for a binary operator: `(left)op(right)`
 * must report a call-argument type mismatch at `pos`.
 */
export type BinaryTypeMismatchCase =
  | readonly [[string, string], ValueTypeName, number]
  | BinaryTypeMismatchCaseObject;

export interface BinaryTypeMismatchCaseObject extends RowMeta {
  /** The two operand sources. */
  operands: readonly [string, string];
  /** The wrong operand's type. */
  wrongType: ValueTypeName;
  /** The 1-based position of the wrong operand. */
  pos: number;
  /**
   * Per-impl outcome. An implementation with an entry uses it; one
   * without an entry gets the derived default (the mismatch error at
   * `pos`).
   */
  outcome?: PerImpl<OperatorCallOutcome>;
}

const defaultBinaryBooleanCases: readonly BinaryTypeMismatchCase[] = [
  [["1", "true"], "integer", 1],
  [["true", "1"], "integer", 2],
  [["[1]", "true"], "list", 1],
];

const defaultBinaryNumberCases: readonly BinaryTypeMismatchCase[] = [
  [["1", "true"], "boolean", 2],
  [["true", "1"], "boolean", 1],
  [["[1]", "1"], "list", 1],
];

/**
 * `EvaluationTester.binaryOperatorOnlyAcceptsBoolean`, parameterized by
 * the implementation (moved from mod.ts).
 */
export function binaryOperatorOnlyAcceptsBoolean(
  ctx: SuiteContext,
  tester: EvaluationTester,
  op: string,
  cases: readonly BinaryTypeMismatchCase[] = defaultBinaryBooleanCases,
  opts?: EvaluationOptionsForTest,
): void {
  describe("只能用于布尔", () => {
    binaryOperatorOnlyAccepts(ctx, tester, op, "boolean", cases, opts);
  });
}

/**
 * `EvaluationTester.binaryOperatorOnlyAcceptsNumbers`, parameterized by
 * the implementation (moved from mod.ts).
 */
export function binaryOperatorOnlyAcceptsNumbers(
  ctx: SuiteContext,
  tester: EvaluationTester,
  op: string,
  cases: readonly BinaryTypeMismatchCase[] = defaultBinaryNumberCases,
  opts?: EvaluationOptionsForTest,
): void {
  describe("只能用于数字", () => {
    binaryOperatorOnlyAccepts(ctx, tester, op, "integer", cases, opts);
  });
}

function binaryOperatorOnlyAccepts(
  ctx: SuiteContext,
  tester: EvaluationTester,
  op: string,
  expected: ValueTypeName,
  cases: readonly BinaryTypeMismatchCase[],
  opts?: EvaluationOptionsForTest,
): void {
  for (const [i, case_] of cases.entries()) {
    const { operands, wrongType, pos, skipFor, todoFor, outcome } =
      normalizeBinaryCase(case_);
    const code = `(${operands[0]})${op}(${operands[1]})`;
    const name = `case ${i + 1}: ${code} => RuntimeError_CallArgumentTypeMismatch`;
    if (todoFor?.includes(ctx.impl)) {
      it.todo(name);
      continue;
    }
    if (skipFor?.includes(ctx.impl)) {
      it.skip(name, () => {});
      continue;
    }
    it(name, () => {
      const resolved = outcome?.[ctx.impl] ?? {
        error: createRuntimeError.callArgumentTypeMismatch(
          pos,
          expected,
          wrongType,
        ),
      };
      if ("error" in resolved) {
        tester.assertExecutionRuntimeError(
          code,
          expectedRuntimeErrorFor(ctx.impl, resolved.error),
          opts,
        );
      } else {
        // "ok" in resolved
        tester.assertExecutionOk(code, resolved.ok, opts);
      }
    });
  }
}

/**
 * `EvaluationTester.unaryOperatorOnlyAcceptsBoolean`, parameterized by
 * the implementation (moved from mod.ts).
 */
export function unaryOperatorOnlyAcceptsBoolean(
  ctx: SuiteContext,
  tester: EvaluationTester,
  op: string,
  opts?: EvaluationOptionsForTest,
): void {
  describe("只能用于布尔", () => {
    unaryOperatorOnlyAccepts(ctx, tester, op, "boolean", [
      ["1", "integer"],
      ["[1]", "list"],
    ], opts);
  });
}

/**
 * `EvaluationTester.unaryOperatorOnlyAcceptsNumbers`, parameterized by
 * the implementation (moved from mod.ts).
 */
export function unaryOperatorOnlyAcceptsNumbers(
  ctx: SuiteContext,
  tester: EvaluationTester,
  op: string,
  opts?: EvaluationOptionsForTest,
): void {
  describe("只能用于数字", () => {
    unaryOperatorOnlyAccepts(ctx, tester, op, "integer", [
      ["true", "boolean"],
      ["[1]", "list"],
    ], opts);
  });
}

function unaryOperatorOnlyAccepts(
  ctx: SuiteContext,
  tester: EvaluationTester,
  op: string,
  expected: ValueTypeName,
  table: [string, ValueTypeName][],
  opts?: EvaluationOptionsForTest,
) {
  for (const [i, [rightValue, rightType]] of table.entries()) {
    const code = `${op}(${rightValue})`;
    it(`case ${i + 1}: ${code} => RuntimeError_CallArgumentTypeMismatch`, () => {
      tester.assertExecutionRuntimeError(
        code,
        expectedRuntimeErrorFor(
          ctx.impl,
          createRuntimeError.callArgumentTypeMismatch(1, expected, rightType),
        ),
        opts,
      );
    });
  }
}

interface NormalizedBinaryCase {
  operands: readonly [string, string];
  wrongType: ValueTypeName;
  pos: number;
  skipFor: readonly ImplTag[] | undefined;
  todoFor: readonly ImplTag[] | undefined;
  outcome: PerImpl<OperatorCallOutcome> | undefined;
}

function normalizeBinaryCase(
  case_: BinaryTypeMismatchCase,
): NormalizedBinaryCase {
  if (!("operands" in case_)) {
    return {
      operands: case_[0],
      wrongType: case_[1],
      pos: case_[2],
      skipFor: undefined,
      todoFor: undefined,
      outcome: undefined,
    };
  }
  return {
    operands: case_.operands,
    wrongType: case_.wrongType,
    pos: case_.pos,
    skipFor: case_.skipFor,
    todoFor: case_.todoFor,
    outcome: case_.outcome,
  };
}
