import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import {
  // afterEach,
  // beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.178.0/testing/bdd.ts";

import {
  assertExecutionOk,
  assertExecutionRuntimeError,
  assertNumber,
  assertNumberArray,
  binaryOperatorOnlyAcceptsBoolean,
  binaryOperatorOnlyAcceptsNumbers,
  theyAreOk,
  unaryOperatorOnlyAcceptsBoolean,
  unaryOperatorOnlyAcceptsNumbers,
} from "./test_helpers.ts";

import { execute } from "./execute.ts";
import { Unimplemented } from "../../errors.ts";
import {
  RuntimeError_DuplicateClosureParameterNames,
  RuntimeError_UnknownVariable,
  RuntimeError_WrongArity,
} from "./runtime_errors.ts";
import { JSValue } from "./runtime.ts";

describe("值", () => {
  describe("整数", () => {
    describe("可以解析整数", () => {
      theyAreOk<number>([
        ["1", 1],
      ]);
    });
  });

  describe("布尔", () => {
    describe("可以解析布尔", () => {
      theyAreOk<boolean>([
        ["true", true],
        ["false", false],
      ]);
    });
  });

  describe("列表", () => {
    describe("可以解析列表", () => {
      theyAreOk<JSValue[]>([
        ["[]", []],
        ["[true]", [true]],
        ["[1, 2, 3]", [1, 2, 3]],
      ]);
    });
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
      theyAreOk<JSValue>([
        ["sum([1, 2, 3])", 6],
        ["zip([1, 2], [3, 4])", [[1, 3], [2, 4]]],
        ["[1, 2, 3] |> head", 1],
        ["[1, 2, 3] |> tail()", [2, 3]],
      ]);
    });

    describe("运算符转函数", () => {
      describe("可以用", () => {
        theyAreOk([
          ["map([1, 2], &-/1)", [-1, -2]],
          ["zipWith([1, 2], [3, 4], &*/2)", [3, 8]],
        ]);
      });
    });

    describe("闭包", () => {
      describe("可以用", () => {
        theyAreOk<JSValue>([
          [String.raw`[2, 3, 5, 7] |> filter(\(x -> x >= 5))`, [5, 7]],
          [String.raw`[2, 3, 5, 7] |> filter \(x -> x >= 5)`, [5, 7]],
          [String.raw`\(a, b -> a + b).(1, 2)`, 3],
          [String.raw`append(filter([10], \(_ -> false)), 100) |> head`, 100],
          [String.raw`append(filter([10], \(_ -> true)), 100) |> head`, 10],
          [
            String
              .raw`\(f, n, l -> append(filter([\( -> l)], \(_ -> n == 100)), \( -> f.(f, n+1, append(l, n)))) |> head |> \(f -> f.()).()) |> \(f -> f.(f, 0, [])).()`,
            Array(100).fill(null).map((_, i) => i), // 0..<100
          ],
          // 等到惰性求值时：
          // [
          //   String
          //     .raw`\(f, n, l -> append(filter([l], \(_ -> n == 100)), f.(f, n+1, append(l, n))) |> head) |> \(f -> f.(f, 0, []))`,
          //   Array(100).fill(null).map((_, i) => i), // 0..<100
          // ],
        ]);
      });
      describe("在参数数量不匹配时报错", () => {
        const table: [string, number, number][] = [
          [String.raw`\(x -> x).()`, 1, 0],
          [String.raw`\( -> 1).(42)`, 0, 1],
        ];
        for (const [i, [code, expected, actual]] of table.entries()) {
          it(`case ${i + 1}: ${code}`, () => {
            assertExecutionRuntimeError(
              code, // FIXME: 闭包名
              new RuntimeError_WrongArity(expected, actual),
            );
          });
        }
      });
      it("不能有重复的参数名", () => {
        assertExecutionRuntimeError(
          String.raw`\(foo, bar, foo -> 0).(1, 2, 3)`,
          new RuntimeError_DuplicateClosureParameterNames("foo"),
        );
      });
      it("内外同名参数不算重复", () => {
        assertExecutionOk(
          String.raw`\(x -> x |> \(x -> x).()).(1)`,
          1,
        );
      });
      describe("无视名为 `_` 的参数", () => {
        it("重复出现多次也没问题", () => {
          assertExecutionOk(String.raw`\(_, x, _ -> x).(1, 2, 3)`, 2);
        });
        it("不会赋值给 `_`", () => {
          assertExecutionRuntimeError(
            String.raw`\(_ -> _).(1)`,
            new RuntimeError_UnknownVariable("_"),
          );
        });
      });
    });
  });
});

describe("运算符", () => {
  describe("功能", () => { // 优先级从低到高排
    describe("优先级=-4", () => {
      describe("||/2", () => {
        describe("进行或运算", () => {
          theyAreOk<boolean>([
            ["false || false", false],
            ["false || true", true],
            ["true || false", true],
            ["true || true", true],
          ]);
        });
        binaryOperatorOnlyAcceptsBoolean("||");
      });
    });
    describe("优先级=-3", () => {
      describe("&&/2", () => {
        describe("进行与运算", () => {
          theyAreOk<boolean>([
            ["false && false", false],
            ["false && true", false],
            ["true && false", false],
            ["true && true", true],
          ]);
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
              assertExecutionOk(eqCode, eqExpected);
            });
            const neCode = `${l} != ${r}`;
            it(`${neCode} => ${!eqExpected}`, () => {
              assertExecutionOk(neCode, !eqExpected);
            });
          }
        });
        describe("不同类型之间不能相互比较", () => {
          const table = [
            ["1", "true", false],
            ["0", "false", false],
            ["false", "false", true],
          ];
          it(() => {
            throw new Unimplemented("TODO: testing");
          });
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
        describe("可以将值传递给一元函数", () => {
          theyAreOk([
            ["[2, 3, 1] |> sort", [1, 2, 3]],
            ["[2, 3, 1] |> sort()", [1, 2, 3]],
          ]);
        });
        describe("可以将值传给多元函数", () => {
          theyAreOk([
            ["[2, 3, 1] |> append(4)", [2, 3, 1, 4]],
          ]);
        });
        describe("可以将值传给使用闭包简写的函数", () => {
          theyAreOk([
            ["[2, 3, 1] |> map \\(x -> x^2)", [4, 9, 1]],
          ]);
        });
        describe("可以将值传给闭包", () => {
          theyAreOk([
            ["10 |> \\(x -> x*2).()", 20],
            ["10 |> \\(x, y -> x*2).(20)", 20],
          ]);
        });
        describe("可以将值传给转为函数的运算符", () => { // 虽然意味不明…
          theyAreOk([
            ["10 |> &-/1.()", -10],
            ["10 |> &-/2.(20)", -10],
          ]);
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
        describe("将两数相加", () => {
          theyAreOk([
            ["1+1", 2],
            ["1+-1", 0],
            ["-1+-1", -2],
          ]);
        });
        binaryOperatorOnlyAcceptsNumbers("+");
      });
      describe("-/2", () => {
        describe("将两数相减", () => {
          theyAreOk([
            ["1-1", 0],
            ["1--1", 2],
            ["-1--1", 0],
          ]);
        });
        binaryOperatorOnlyAcceptsNumbers("-");
      });
      describe("+/1", () => {
        describe("让数字保持原状", () => {
          theyAreOk([
            ["+1", 1],
            ["+-1", -1],
            ["-+1", -1],
          ]);
        });
        unaryOperatorOnlyAcceptsNumbers("+");
      });
      describe("-/1", () => {
        describe("取数字的相反数", () => {
          theyAreOk([
            ["-1", -1],
            ["--1", 1],
          ]);
        });
        unaryOperatorOnlyAcceptsNumbers("-");
      });
    });

    describe("优先级=3", () => {
      describe("*/2", () => {
        describe("将两数相乘", () => {
          theyAreOk([
            ["10*2", 20],
            ["10*-2", -20],
            ["-1*-1", 1],
          ]);
        });
        binaryOperatorOnlyAcceptsNumbers("*");
      });
      describe("///2", () => {
        describe("将两数相整除", () => {
          theyAreOk([
            ["1//2", 0],
            ["2//2", 1],
            ["3//2", 1],
            ["-3//2", -1],
            ["3//-2", -1],
            ["-3//-2", 1],
          ]);
        });
        binaryOperatorOnlyAcceptsNumbers("//");
      });
      describe("%/2", () => {
        describe("将两非负整数取模", () => {
          theyAreOk([
            ["1%2", 1],
            ["2%2", 0],
            ["3%2", 1],
          ]);
        });
        it("任何操作数都不能是负数", () => {
          assertExecutionRuntimeError(
            "(-3) % 2",
            "操作 “(-3) % 2” 非法：被除数不能为负数",
          );
          assertExecutionRuntimeError(
            "3 % -2",
            "操作 “3 % -2” 非法：除数必须为正数",
          );
          assertExecutionRuntimeError(
            "(-3)%-2",
            "操作 “(-3) % -2” 非法：被除数不能为负数",
          );
          assertExecutionOk("-3%2", -1); // 取模的优先级更高
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
        describe("执行指数运算", () => {
          theyAreOk([
            ["2^8", 256],
          ]);
        });

        it("只接受非负数次幂", () => {
          assertExecutionRuntimeError(
            "3 ^ -2",
            "操作 “3 ^ -2” 非法：指数不能为负数",
          );
        });
      });
    });

    describe("!/1", () => {
      describe("将布尔求非", () => {
        theyAreOk([
          ["!true", false],
          ["!false", true],
        ]);
      });
      unaryOperatorOnlyAcceptsBoolean("!");
    });
  });

  describe("优先级", () => {
    it(() => {
      throw new Unimplemented("TODO: testing");
    });
  });
});

describe("自带函数", () => {
  it(() => {
    throw new Unimplemented("TODO: testing");
  });
});

describe("限制", () => {
  describe("整数", () => {
    it("不能允许大于 `Number.MAX_SAFE_INTEGER` 的整数", () => {
      const safe = Number.MAX_SAFE_INTEGER;

      assertExecutionOk(`${safe}`, safe);
      assertExecutionRuntimeError(`${safe + 1}`, "TODO: error");
      assertExecutionRuntimeError(`${safe} + 1`, "TODO: error");
    });
    it("不能允许小于 `Number.MIN_SAFE_INTEGER` 的整数", () => {
      const safe = Number.MIN_SAFE_INTEGER;

      assertExecutionOk(`${safe}`, safe);
      assertExecutionRuntimeError(`${safe - 1}`, "TODO: error");
      assertExecutionRuntimeError(`${safe} - 1`, "TODO: error");
    });
  });

  describe("列表", () => {
    it(() => {
      throw new Unimplemented("TODO: testing");
    });
    // it("作为结果不能有超过 32 个元素", () => {
    //   assertExecutionOk("32#1", Array(32).fill(1))
    //   assertExecutionRuntimeError("33#1", "TODO: error")
    //   assertExecutionRuntimeError("[[16#1], 17#1]", "TODO: error")
    // })

    // it("同一展开层级只能同时有 32 个列表元素", () => {
    //   assertExecutionOk("concat(16#1, 16#1) |> sum", 32)
    //   assertExecutionOk("append(16#1, 17#1 |> sum) |> sum", 33)
    //   assertExecutionRuntimeError("concat(16#1, 17#1) |> sum", "TODO: error")
    // })
  });

  describe("生成器", () => {
    it(() => {
      throw new Unimplemented("TODO: testing");
    });
  });
});

// TODO: 同种子下结果相同
// TODO: 运行时错误
