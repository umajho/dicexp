import { describe, it } from "vitest";

import { makeTester, scopeWith } from "./utils";

import { operatorScope } from "../lib";

describe("base/operators", () => {
  describe("or/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["or/2"]);
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
        [String.raw`true or true`, true],
        [String.raw`true or false`, true],
        [String.raw`false or true`, true],
        [String.raw`false or false`, false],
      ]);
    });
    describe("moved from package `dicexp`", () => {
      tester.binaryOperatorOnlyAcceptsBoolean("or");
    });
  });
  describe("and/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["and/2"]);
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
        [String.raw`true and true`, true],
        [String.raw`true and false`, false],
        [String.raw`false and true`, false],
        [String.raw`false and false`, false],
      ]);
    });
    describe("moved from package `dicexp`", () => {
      tester.binaryOperatorOnlyAcceptsBoolean("and");
    });
  });
  describe("==/2, !=/2", () => {
    describe("正确使用时", () => {
      const topLevelScope = scopeWith(operatorScope, ["==/2", "!=/2"]);
      const tester = makeTester({ topLevelScope });
      tester.theyAreOk([
        [String.raw`true == true`, true],
        [String.raw`true != true`, false],
        [String.raw`1 == 1`, true],
        [String.raw`1 != 1`, false],
        [String.raw`1 == 2`, false],
        [String.raw`1 != 2`, true],
      ]);
    });
    describe("moved from package `dicexp`", () => {
      const topLevelScope = scopeWith(operatorScope, ["==/2", "!=/2", "-/1"]);
      const tester = makeTester({ topLevelScope });
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
      const topLevelScope = scopeWith(
        operatorScope,
        ["</2", ">/2", "<=/2", ">=/2"],
      );
      const tester = makeTester({ topLevelScope });
      tester.theyAreOk([
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
      const topLevelScope = scopeWith(
        operatorScope,
        ["</2", ">/2", "<=/2", ">=/2", "-/1"],
      );
      const tester = makeTester({ topLevelScope });
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

      tester.binaryOperatorOnlyAcceptsNumbers("<");
      tester.binaryOperatorOnlyAcceptsNumbers(">");
      tester.binaryOperatorOnlyAcceptsNumbers("<=");
      tester.binaryOperatorOnlyAcceptsNumbers(">=");
    });
  });
  describe("~/2, ~/1", () => {
    // 针对运算结果的测试位于 dicexp 库的测试中，因此不在这里重复写这部分测试

    describe("moved from package `dicexp`", () => {
      const topLevelScope = scopeWith(operatorScope, ["~/2", "~/1"]);
      const tester = makeTester({ topLevelScope });
      tester.unaryOperatorOnlyAcceptsNumbers("~");
      tester.binaryOperatorOnlyAcceptsNumbers("~");
    });
  });
  describe("+/2, -/2", () => {
    describe("正确使用时", () => {
      const topLevelScope = scopeWith(operatorScope, ["+/2", "-/2"]);
      const tester = makeTester({ topLevelScope });
      tester.theyAreOk([
        [String.raw`2+3`, 5],
        [String.raw`2-3`, -1],
      ]);
    });
    describe("moved from package `dicexp`", () => {
      const topLevelScope = scopeWith(operatorScope, ["+/2", "-/2", "-/1"]);
      const tester = makeTester({ topLevelScope });
      describe("+/2", () => {
        describe("将两数相加", () => {
          tester.theyAreOk([
            ["1+1", 2],
            ["1+-1", 0],
            ["-1+-1", -2],
          ]);
        });
        tester.binaryOperatorOnlyAcceptsNumbers("+");
      });
      describe("-/2", () => {
        describe("将两数相减", () => {
          tester.theyAreOk([
            ["1-1", 0],
            ["1--1", 2],
            ["-1--1", 0],
          ]);
        });
        tester.binaryOperatorOnlyAcceptsNumbers("-");
      });
    });
  });
  describe("+/1, -/1", () => {
    const topLevelScope = scopeWith(operatorScope, ["+/1", "-/1"]);
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
        [String.raw`+1`, 1],
        [String.raw`-1`, -1],
      ]);
    });
    describe("moved from package `dicexp`", () => {
      describe("+/1", () => {
        describe("让数字保持原状", () => {
          tester.theyAreOk([
            ["+1", 1],
            ["+-1", -1],
            ["-+1", -1],
          ]);
        });
        tester.unaryOperatorOnlyAcceptsNumbers("+");
      });
      describe("-/1", () => {
        describe("取数字的相反数", () => {
          tester.theyAreOk([
            ["-1", -1],
            ["--1", 1],
          ]);
        });
        tester.unaryOperatorOnlyAcceptsNumbers("-");
      });
    });
  });
  describe("*/2", () => {
    describe("正确使用时", () => {
      const topLevelScope = scopeWith(operatorScope, ["*/2"]);
      const tester = makeTester({ topLevelScope });
      tester.theyAreOk([
        [String.raw`2*3`, 6],
      ]);
    });
    describe("moved from package `dicexp`", () => {
      const topLevelScope = scopeWith(operatorScope, ["*/2", "-/1"]);
      const tester = makeTester({ topLevelScope });
      describe("将两数相乘", () => {
        tester.theyAreOk([
          ["10*2", 20],
          ["10*-2", -20],
          ["-1*-1", 1],
        ]);
      });
      tester.binaryOperatorOnlyAcceptsNumbers("*");
    });
  });
  describe("///2", () => {
    const topLevelScope = scopeWith(operatorScope, ["///2", "-/1"]);
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
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
        tester.theyAreOk([
          ["1//2", 0],
          ["2//2", 1],
          ["3//2", 1],
          ["-3//2", -1],
          ["3//-2", -1],
          ["-3//-2", 1],
        ]);
      });
      tester.binaryOperatorOnlyAcceptsNumbers("//");
    });
  });
  describe("%/2", () => {
    describe("正确使用时", () => {
      const topLevelScope = scopeWith(operatorScope, ["%/2"]);
      const tester = makeTester({ topLevelScope });
      tester.theyAreOk([
        [String.raw`2%3`, 2],
        [String.raw`3%2`, 1],
      ]);
    });
    describe("moved from package `dicexp`", () => {
      const topLevelScope = scopeWith(operatorScope, ["%/2", "-/1"]);
      const tester = makeTester({ topLevelScope });
      describe("将两非负整数取模", () => {
        tester.theyAreOk([
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
      tester.binaryOperatorOnlyAcceptsNumbers("%");
    });
  });
  describe("**/2", () => {
    for (const expOp of ["**", "^"]) {
      const topLevelScope = scopeWith(
        operatorScope,
        expOp === "**" ? ["**/2", "-/1"] : ["**/2", "^/2" as any, "-/1"],
      );
      const tester = makeTester({ topLevelScope });
      describe(`作为 \`${expOp}\``, () => {
        describe("正确使用时", () => {
          tester.theyAreOk([
            [String.raw`2${expOp}3`, 8],
            [String.raw`(-2)${expOp}3`, -8],
          ]);
        });
        describe("moved from package `dicexp`", () => {
          describe("执行指数运算", () => {
            tester.theyAreOk([
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
      const topLevelScope = scopeWith(operatorScope, ["d/1"]);
      const tester = makeTester({ topLevelScope });
      tester.unaryOperatorOnlyAcceptsNumbers("d");
    });
  });
  describe("not/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["not/1"]);
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
        [String.raw`not true`, false],
        [String.raw`not false`, true],
      ]);
    });
    describe("moved from package `dicexp`", () => {
      tester.unaryOperatorOnlyAcceptsBoolean("not");
    });
  });
});
