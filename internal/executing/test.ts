import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import {
  // afterEach,
  // beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.178.0/testing/bdd.ts";

import {
  assertExecutionOk,
  assertExecutionThrows,
  assertNumber,
  assertNumberArray,
  binaryOperatorOnlyAcceptsBoolean,
  binaryOperatorOnlyAcceptsNumbers,
  unaryOperatorOnlyAcceptsBoolean,
  unaryOperatorOnlyAcceptsNumbers,
} from "./test_helpers.ts";

import { execute } from "./execute.ts";

describe("值", () => {
  describe("整数", () => {
    it("可以解析整数", () => {
      assertExecutionOk("1", 1);
    });
  });

  describe("布尔", () => {
    it("可以解析布尔", () => {
      assertExecutionOk("true", true);
      assertExecutionOk("false", false);
    });
  });

  describe("数组", () => {
    it("可以解析数组", () => {
      assertExecutionOk("[]", []);
      assertExecutionOk("[true]", [true]);
      assertExecutionOk("[1, 2, 3]", [1, 2, 3]);
    });

    // TODO
    // it("可以通过下标取数组值", () => {
    //   assertExecutionOk("[1, 2, 3][0]", 1)
    //   assertExecutionOk("([3, 2, 1] |> sort)[0]", 1)
    // })
  });

  describe("生成器", () => {
    describe("范围生成器", () => {
      describe("~/2", () => {
        it("保证生成的数在范围内", () => {
          const lower = 10;
          const code = `${lower}~${lower * 2}`;
          for (let j = 0; j < 100; j++) {
            const result = assertNumber(execute(code));

            assert(
              result >= lower && result <= lower * 2,
              `\`${code}\` => ${result}`,
            );
          }
        });
        it({ // FIXME: 应该检查生成的随机数符合均匀分布
          name: "保证生成的是随机数",
          fn: () => {
            // 有可忽略的 1/1000000^10 的概率 false negative，后几个同名测试也是
            const lower = 1000000;
            const code = `${lower}~${lower * 2}`;
            const results = Array(10).fill(null).map((_) => execute(code));
            assert(new Set(results).size > 1);
          },
        });
      });
      describe("~/1", () => {
        it("保证生成的数在范围内", () => {
          const upper = 10;
          const code = `~${upper}`;
          for (let j = 0; j < 100; j++) {
            const result = assertNumber(execute(code));
            assert(
              result >= 1 && result <= upper,
              `\`${code}\` => ${result}`,
            );
          }
        });
        it("保证生成的是随机数", () => {
          const upper = 1000000;
          const code = `~${upper}`;
          const results = Array(10).fill(null).map((_) => execute(code));
          assert(new Set(results).size > 1);
        });
      });

      describe("d/1 与 d/2", () => {
        it("保证生成的数在范围内", () => {
          for (const isBinary of [false, true]) {
            const upper = 10;
            const times = isBinary ? 100 : 1;
            const code = `${isBinary ? 100 : ""}d${upper}`;

            for (let j = 0; j < 100; j++) {
              const result = assertNumber(execute(code));
              assert(
                result >= 1 * times && result <= upper * times,
                `\`${code}\` => ${result}`,
              );
            }
          }
        });
        it("保证生成的是随机数", () => {
          const upper = 1000000;
          const code = `d${upper}`;
          const results = Array(10).fill(null).map((_) => execute(code));
          assert(new Set(results).size > 1);
        });
      });

      describe("d%/1 与 d%/2", () => {
        it("保证生成的数在范围内", () => {
          for (const isBinary of [false, true]) {
            const upper = 10;
            const times = isBinary ? 100 : 1;
            const code = `${isBinary ? 100 : ""}d%${upper}`;

            for (let j = 0; j < 100; j++) {
              const result = assertNumber(execute(code));
              assert(
                result >= 0 && result <= (upper - 1) * times,
                `\`${code}\` => ${result}`,
              );
            }
          }
        });
      });
      it("保证生成的是随机数", () => {
        const upper = 1000000;
        const code = `d%${upper}`;
        const results = Array(10).fill(null).map((_) => execute(code));
        assert(new Set(results).size > 1);
      });
    });
  });

  describe("函数", () => {
    describe("可以用", () => {
      const table: [string, unknown][] = [
        ["sum([1, 2, 3])", 6],
        ["zip([1, 2], [3, 4])", [[1, 3], [2, 4]]],
        ["[1, 2, 3] |> head", 1],
        ["[1, 2, 3] |> tail()", [2, 3]],
      ];
      for (const [i, [input, expectedOutput]] of table.entries()) {
        it(`case ${i + 1}: ${input}`, () => {
          assertExecutionOk(input, expectedOutput);
        });
      }
    });

    describe("运算符转函数", () => {
      describe("可以用", () => {
        const table: [string, unknown][] = [
          ["map([1, 2], &-/1)", [-1, -2]],
          ["zipWith([1, 2], [3, 4], &*/2)", [3, 8]],
        ];
        for (const [i, [input, expectedOutput]] of table.entries()) {
          it(`case ${i + 1}: ${input}`, () => {
            assertExecutionOk(input, expectedOutput);
          });
        }
      });
    });

    describe("闭包", () => {
      describe("可以用", () => {
        const table: [string, unknown][] = [
          ["[2, 3, 5, 7] |> filter(\\(x -> x >= 5))", [5, 7]],
          ["[2, 3, 5, 7] |> filter \\(x -> x >= 5)", [5, 7]],
        ];
        for (const [i, [input, expectedOutput]] of table.entries()) {
          it(`case ${i + 1}: ${input}`, () => {
            assertExecutionOk(input, expectedOutput);
          });
        }
      });
    });
  });
});

describe("运算符", () => {
  describe("功能", () => { // 优先级从低到高排
    describe("优先级=-4", () => {
      describe("||/2", () => {
        it("进行或运算", () => {
          assertExecutionOk("false || false", false);
          assertExecutionOk("false || true", true);
          assertExecutionOk("true || false", true);
          assertExecutionOk("true || true", true);
        });
        binaryOperatorOnlyAcceptsBoolean("||");
      });
    });
    describe("优先级=-3", () => {
      describe("&&/2", () => {
        it("进行与运算", () => {
          assertExecutionOk("false && false", false);
          assertExecutionOk("false && true", false);
          assertExecutionOk("true && false", false);
          assertExecutionOk("true || true", true);
        });
        binaryOperatorOnlyAcceptsBoolean("&&");
      });
    });

    describe("优先级=-2", () => {
      describe("==/2 与 !=/2", () => {
        const table = [
          ["1", "1", true],
          ["-1", "-1", true],
          ["1", "-1", false],
        ];
        describe("相同类型之间比较是否相等", () => {
          for (const [l, r, eqExpected] of table) {
            const eqCode = `${l} == ${r}`;
            it(`${eqCode} => ${eqExpected}`, () => {
              assertExecutionOk(eqCode, eqExpected, eqCode);
            });
            const neCode = `${l} != ${r}`;
            it(`${neCode} => ${!eqExpected}`, () => {
              assertExecutionOk(neCode, !eqExpected, neCode);
            });
          }
        });
        describe("不同类型之间不能相互比较", () => {
          const table = [
            ["1", "true", false],
            ["0", "false", false],
            ["false", "false", true],
          ];
          // TODO
        });
      });
    });

    describe("优先级=-1", () => {
      describe("</2、>/2、<=/2 与 >=/2", () => {
        it("比较两数大小", () => {
          const table = [
            ["1", "<", "2"],
            ["2", ">", "1"],
            ["1", "==", "1"],
            ["-1", ">", "-2"],
          ];
          for (const [l, relation, r] of table) {
            assertExecutionOk(`${l} < ${r}`, relation == "<");
            assertExecutionOk(`${l} > ${r}`, relation == ">");
            assertExecutionOk(
              `${l} <= ${r}`,
              relation == "<" || relation == "==",
            );
            assertExecutionOk(
              `${l} >= ${r}`,
              relation == ">" || relation == "==",
            );
          }
        });

        binaryOperatorOnlyAcceptsNumbers("<");
        binaryOperatorOnlyAcceptsNumbers(">");
        binaryOperatorOnlyAcceptsNumbers("<=");
        binaryOperatorOnlyAcceptsNumbers(">=");
      });
    });

    describe("优先级=0", () => {
      describe("|>/2", () => {
        it("可以将值传递给一元函数", () => {
          assertExecutionOk("[2, 3, 1] |> sort", [1, 2, 3]);
          assertExecutionOk("[2, 3, 1] |> sort()", [1, 2, 3]);
        });
        it("可以将值传给多元函数", () => {
          assertExecutionOk("[2, 3, 1] |> append(4)", [2, 3, 1, 4]);
        });
        it("可以将值传给使用闭包简写的函数", () => {
          assertExecutionOk("[2, 3, 1] |> map \\(x -> x^2)", [4, 9, 1]);
        });
        it("可以将值传给闭包", () => {
          assertExecutionOk("10 |> \\(x -> x*2)", 20);
          assertExecutionOk("10 |> \\(x, y -> x*2)(20)", 20);
        });
        it("可以将值传给转为函数的运算符", () => { // 虽然意味不明…
          assertExecutionOk("10 |> &-/1", 20);
          assertExecutionOk("10 |> &-/2(20)", -10);
        });
      });
    });

    describe("优先级=1", () => {
      describe("~/1 与 ~/2", () => {
        // 已在生成器处测试

        binaryOperatorOnlyAcceptsNumbers("~");
      });
    });

    describe("优先级=2", () => {
      describe("+/2", () => {
        it("将两数相加", () => {
          assertExecutionOk("1+1", 2);
          assertExecutionOk("1+-1", 0);
          assertExecutionOk("-1+-1", -2);
        });
        binaryOperatorOnlyAcceptsNumbers("+");
      });
      describe("-/2", () => {
        it("将两数相减", () => {
          assertExecutionOk("1-1", 0);
          assertExecutionOk("1--1", 2);
          assertExecutionOk("-1--1", 0);
        });
        binaryOperatorOnlyAcceptsNumbers("-");
      });
      describe("+/1", () => {
        it("让数字保持原状", () => {
          assertExecutionOk("+1", 1);
          assertExecutionOk("+-1", -1);
          assertExecutionOk("-+1", -1);
        });
        unaryOperatorOnlyAcceptsNumbers("+");
      });
      describe("-/1", () => {
        it("将数字取反", () => {
          assertExecutionOk("-1", -1);
          assertExecutionOk("--1", 1);
        });
        unaryOperatorOnlyAcceptsNumbers("-");
      });
    });

    describe("优先级=3", () => {
      describe("*/2", () => {
        it("将两数相乘", () => {
          assertExecutionOk("10*2", 20);
          assertExecutionOk("10*-2", -20);
          assertExecutionOk("-1*-1", 1);
        });
        binaryOperatorOnlyAcceptsNumbers("*");
      });
      describe("///2", () => {
        it("将两数相整除", () => {
          assertExecutionOk("1//2", 0);
          assertExecutionOk("2//2", 1);
          assertExecutionOk("3//2", 1);
          assertExecutionOk("-3//2", -1);
          assertExecutionOk("3//-2", -1);
          assertExecutionOk("-3//-2", 1);
        });
        binaryOperatorOnlyAcceptsNumbers("//");
      });
      describe("%/2", () => {
        it("将两非负整数取模", () => {
          assertExecutionOk("1%2", 1);
          assertExecutionOk("2%2", 0);
          assertExecutionOk("3%2", 1);
        });
        it("任何操作数都不能是负数", () => {
          assertExecutionThrows("-3%2", "TODO: error");
          assertExecutionThrows("3%-2", "TODO: error");
          assertExecutionThrows("-3%-2", "TODO: error");
        });
        binaryOperatorOnlyAcceptsNumbers("%");
      });
    });

    describe("优先级=4", () => {
      describe("#/1", () => {
        it("将右侧内容在 eval 前重复左侧次", () => {
          assertExecutionOk("3#10", Array(3).fill(10));

          // NOTE: 有 1/10^30 的概率真的相同，忽略不计
          const result = assertNumberArray(execute("10#d1000"));
          assert((new Set(result)).size > 1, `${result}`);
        });
      });
    });

    describe("优先级=5", () => {
      describe("d/1 与 d%/1", () => {
        // 已在生成器处测试

        unaryOperatorOnlyAcceptsNumbers("~");
        unaryOperatorOnlyAcceptsNumbers("d");
        unaryOperatorOnlyAcceptsNumbers("d%");
      });
    });

    describe("优先级=6", () => {
      describe("^", () => {
        it("执行指数运算", () => {
          assertExecutionOk("2^8", 256);
        });

        // TODO: 只接受整数次幂
      });
    });

    describe("!/1", () => {
      it("将布尔求非", () => {
        assertExecutionOk("!true", false);
        assertExecutionOk("!false", true);
      });
      unaryOperatorOnlyAcceptsBoolean("!");
    });
  });

  describe("优先级", () => {
    // TODO
  });
});

describe("自带函数", () => {
  // TODO
});

describe("限制", () => {
  describe("整数", () => {
    it("不能允许大于 `Number.MAX_SAFE_INTEGER` 的整数", () => {
      const safe = Number.MAX_SAFE_INTEGER;

      assertExecutionOk(`${safe}`, safe);
      assertExecutionThrows(`${safe + 1}`, "TODO: error");
      assertExecutionThrows(`${safe} + 1`, "TODO: error");
    });
    it("不能允许小于 `Number.MIN_SAFE_INTEGER` 的整数", () => {
      const safe = Number.MIN_SAFE_INTEGER;

      assertExecutionOk(`${safe}`, safe);
      assertExecutionThrows(`${safe - 1}`, "TODO: error");
      assertExecutionThrows(`${safe} - 1`, "TODO: error");
    });
  });

  describe("数组", () => {
    // TODO:
    // it("作为结果不能有超过 32 个元素", () => {
    //   assertExecutionOk("32#1", Array(32).fill(1))
    //   assertExecutionThrows("33#1", "TODO: error")
    //   assertExecutionThrows("[[16#1], 17#1]", "TODO: error")
    // })

    // it("同一展开层级只能同时有 32 个数组元素", () => {
    //   assertExecutionOk("concat(16#1, 16#1) |> sum", 32)
    //   assertExecutionOk("append(16#1, 17#1 |> sum) |> sum", 33)
    //   assertExecutionThrows("concat(16#1, 17#1) |> sum", "TODO: error")
    // })
  });

  describe("生成器", () => {
    // TODO
  });
});

// TODO: 同种子下结果相同
// TODO: 运行时错误
