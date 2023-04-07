import { assert, describe, it } from "vitest";

// import { spawn, Thread, Worker } from "npm:threads";

import {
  assertExecutionOk,
  assertExecutionRuntimeError,
  assertNumber,
  assertResultsAreRandom,
  binaryOperatorOnlyAcceptsBoolean,
  binaryOperatorOnlyAcceptsNumbers,
  theyAreOk,
  unaryOperatorOnlyAcceptsBoolean,
  unaryOperatorOnlyAcceptsNumbers,
} from "./test_helpers";

import { evaluate } from "./test_helpers";
import {
  runtimeError_duplicateClosureParameterNames,
  runtimeError_unknownVariable,
  runtimeError_wrongArity,
} from "../src/runtime_errors_impl";
import { JSValue, Scope } from "../src/runtime";
import { flatten } from "./utils";
import { makeFunction } from "../src/builtin_functions/helpers";
import { Restrictions } from "../src/restrictions";
import { builtinScope } from "../src/builtin_functions/mod";

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
            const result = assertNumber(evaluate(code));

            assert(
              result >= lower && result <= lower * 2,
              `\`${code}\` => ${result}`,
            );
          }
        });
        it("保证生成的是随机数", () => {
          // 有可忽略的 1/1000000^10 的概率 false negative，后几个同名测试也是
          const lower = 1000000;
          const code = `${lower}~${lower * 2}`;
          assertResultsAreRandom(code);
        });
      });
      describe("~/1", () => {
        it("保证生成的数在范围内", () => {
          const upper = 10;
          const code = `~${upper}`;
          for (let j = 0; j < 100; j++) {
            const result = assertNumber(evaluate(code));
            assert(
              result >= 1 && result <= upper,
              `\`${code}\` => ${result}`,
            );
          }
        });
        it("保证生成的是随机数", () => {
          const upper = 1000000;
          const code = `~${upper}`;
          assertResultsAreRandom(code);
        });
      });

      describe("d/1 与 d/2", () => {
        it("保证生成的数在范围内", () => {
          for (const isBinary of [false, true]) {
            const upper = 10;
            const times = isBinary ? 100 : 1;
            const code = `${isBinary ? 100 : ""}d${upper}`;

            for (let j = 0; j < 100; j++) {
              const result = assertNumber(evaluate(code));
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
          assertResultsAreRandom(code);
        });
        it.todo("`d2` 不会死循环", /*async*/ () => {
          // const d2 = await spawn(new Worker("./test_workers/d2.ts"));
          // let stopped = false;
          // Promise.race([
          //   new Promise((resolve) => setTimeout(() => resolve(null), 100)),
          //   new Promise((resolve) => {
          //     d2().then(() => {
          //       stopped = true;
          //       resolve(null);
          //     });
          //   }),
          // ]);
          // assert(stopped);
        });
        it.todo("`d(2^32+1)` 不会死循环");
      });

      describe.skip("d%/1 与 d%/2", () => { // 弃用 `d%`
        it("保证生成的数在范围内", () => {
          for (const isBinary of [false, true]) {
            const upper = 10;
            const times = isBinary ? 100 : 1;
            const code = `${isBinary ? 100 : ""}d%${upper}`;

            for (let j = 0; j < 100; j++) {
              const result = assertNumber(evaluate(code));
              assert(
                result >= 0 && result <= (upper - 1) * times,
                `\`${code}\` => ${result}`,
              );
            }
          }
        });
      });
      it.skip("保证生成的是随机数", () => { // FIXME: 同名一系列测试都忘了取出结果
        const upper = 1000000;
        const code = `d%${upper}`;
        assertResultsAreRandom(code);
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
              runtimeError_wrongArity(expected, actual),
            );
          });
        }
      });
      it("不能有重复的参数名", () => {
        assertExecutionRuntimeError(
          String.raw`\(foo, bar, foo -> 0).(1, 2, 3)`,
          runtimeError_duplicateClosureParameterNames("foo"),
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
            runtimeError_unknownVariable("_"),
          );
        });
      });
    });
  });
});

describe("运算符", () => {
  describe("功能", () => { // 优先级从低到高排
    describe("or/2", () => {
      describe("进行或运算", () => {
        theyAreOk<boolean>([
          ["false or false", false],
          ["false or true", true],
          ["true or false", true],
          ["true or true", true],
        ]);
      });
      binaryOperatorOnlyAcceptsBoolean("or");
    });

    describe("and/2", () => {
      describe("进行与运算", () => {
        theyAreOk<boolean>([
          ["false and false", false],
          ["false and true", false],
          ["true and false", false],
          ["true and true", true],
        ]);
      });
      binaryOperatorOnlyAcceptsBoolean("and");
    });

    describe("==/2 与 !=/2", () => {
      const table = [
        ["1", "1", true],
        ["-1", "-1", true],
        ["1", "-1", false],
        ["false", "false", true],
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
          ["1", "true"],
          ["0", "false"],
        ];
        for (const [l, r] of table) {
          for (const op of ["==", "!="]) {
            const code = `${l} ${op} ${r}`;
            it(`${l} ${op} ${r} => error`, () => {
              assertExecutionRuntimeError(
                code,
                `操作 “${op}” 非法：两侧操作数的类型不相同`,
              );
            });
          }
        }
      });
    });

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

    // describe("|>/2", () => {
    //   // 管道运算符在解析时被消去，因此不存在于此处
    // });

    describe("~/1 与 ~/2", () => {
      // 已在生成器处测试

      unaryOperatorOnlyAcceptsNumbers("~");
      binaryOperatorOnlyAcceptsNumbers("~");
    });

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

    describe("#/2", () => {
      describe("将右侧内容在 eval 前反复左侧次", () => {
        it("反复字面量", () => {
          assertExecutionOk("3#10", Array(3).fill(10));
        });
      });
      describe("反复数组取值正常", () => {
        theyAreOk([["10#([1]|>at(0))", Array(10).fill(1)]]);
      });

      // 测试 “重复求值结果不同” 放在了 “语意” 那里
    });

    describe("d/1", () => {
      // 已在生成器处测试

      unaryOperatorOnlyAcceptsNumbers("d");
    });
    describe.skip("d%/1", () => { // 弃用 `d%`
      // 已在生成器处测试

      unaryOperatorOnlyAcceptsNumbers("d%");
    });

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

    describe("将布尔求非", () => {
      theyAreOk([
        ["not true", false],
        ["not false", true],
      ]);
    });
    unaryOperatorOnlyAcceptsBoolean("not");
  });
});

describe("语意", () => {
  const SUPER_BIG_DIE = `d1_000_000_000`; // 大到让巧合可以忽略不计

  const exps = [
    `${SUPER_BIG_DIE}`,
    `(${SUPER_BIG_DIE}-1)`,
    `[${SUPER_BIG_DIE}]`,
    `sum([${SUPER_BIG_DIE}])`, // 内部用 flattenListAll 求列表元素值
    `sort([${SUPER_BIG_DIE}])`, // 内部用 unwrapListOneOf 求列表元素值
    `append([], ${SUPER_BIG_DIE})`, // 不破坏列表元素惰性
    String.raw`\(-> ${SUPER_BIG_DIE}).()`,
  ];

  describe("具名的变量其值固定", () => {
    const longListOfXs = "[" + Array(1000).fill("x").join(", ") + "]";
    const table = exps
      .map((exp) => String.raw`${exp} |> \(x -> ${longListOfXs}).()`);
    table.push(...[
      String.raw`1000#\(x->x).(${SUPER_BIG_DIE})`,
    ]);

    for (const [i, code] of table.entries()) {
      it(`case ${i + 1}: ${code}`, () => {
        const result = assertExecutionOk(code);
        const resultFlatten = flatten(result as any, Infinity) as number[];
        assert(resultFlatten.every((el) => Number.isFinite(el)));
        assert.deepEqual((new Set(resultFlatten)).size, 1);
      });
    }
  });

  describe("重复求值结果不同", () => {
    const table = exps.map((exp) => `1000#${exp}`);

    for (const [i, code] of table.entries()) {
      it(`case ${i + 1}: ${code}`, () => {
        const result = assertExecutionOk(code);
        const resultFlatten = flatten(result as any, Infinity);
        assert(resultFlatten.every((el) => Number.isFinite(el)));
        assert((new Set(resultFlatten)).size > 1);
      });
    }
  });
});

describe("自带函数", () => {
  it.todo("TODO", () => {
  });
});

describe("从管道的测试那里移过来的", () => {
  theyAreOk([
    ["[2, 3, 1] |> sort", [1, 2, 3]],
    ["[2, 3, 1] |> sort()", [1, 2, 3]],
    ["[2, 3, 1] |> append(4)", [2, 3, 1, 4]],
    ["[2, 3, 1] |> map \\(x -> x^2)", [4, 9, 1]],
    ["10 |> \\(x -> x*2).()", 20],
    ["10 |> \\(x, y -> x*2).(20)", 20],
    ["10 |> &-/1.()", -10],
    ["10 |> &-/2.(20)", -10],
  ] as [string, JSValue][]);
});

describe("限制", () => {
  describe("内在限制", () => {
    describe("整数", () => {
      it("不能允许大于 `Number.MAX_SAFE_INTEGER` 的整数", () => {
        const safe = Number.MAX_SAFE_INTEGER;

        assertExecutionOk(`${safe}`, safe);
        // 解析错误
        // assertExecutionRuntimeError(
        //   `${safe + 1}`,
        //   "越过内在限制「最大安全整数」（允许 9007199254740991）",
        // );
        assertExecutionRuntimeError(
          `${safe} + 1`,
          "越过内在限制「最大安全整数」（允许 9007199254740991）",
        );
      });
      it("不能允许小于 `Number.MIN_SAFE_INTEGER` 的整数", () => {
        const safe = Number.MIN_SAFE_INTEGER;

        assertExecutionOk(`${safe}`, safe);
        // 解析错误
        // assertExecutionRuntimeError(
        //   `${safe - 1}`,
        //   "越过内在限制「最小安全整数」（允许 -9007199254740991）",
        // );
        assertExecutionRuntimeError(
          `${safe} - 1`,
          "越过内在限制「最小安全整数」（允许 -9007199254740991）",
        );
      });
    });
  });

  describe("外加限制", () => {
    describe("软性超时", () => { // FIXME: 应该用 fake time
      const restrictions: Restrictions = { softTimeout: { ms: 10 } };
      it("未超时则无影响", () => {
        assertExecutionOk(`${1}`, undefined, { restrictions });
      });

      describe("超时则返回运行时错误", () => {
        const scope: Scope = {
          "sleep/1": makeFunction(["integer"], (args, _rtm) => {
            const [ms] = args as [number];
            const start = performance.now();
            while (performance.now() - start <= ms) { /* noop */ }
            return { ok: { value: true, pure: true } };
          }),
        };

        it("超时后如果再也没有调用过函数则不会被触发", () => {
          assertExecutionOk(`[[sleep(20)]]`, [[true]], {
            topLevelScope: scope,
            restrictions,
          });
        });

        it("超时后的下一次调用函数才会触发", () => {
          assertExecutionRuntimeError(
            String.raw`sleep(20) and \(->true).()`,
            "越过外加限制「运行时间」（允许 10 毫秒）",
            { topLevelScope: { ...builtinScope, ...scope }, restrictions },
          );
        });
      });
    });

    describe("调用次数", () => {
      describe("闭包", () => {
        const restrictions: Restrictions = { maxCalls: 2 };
        theyAreOk([String.raw`\(->\(->1).()).()`], { restrictions });
        it("超过次数则返回运行时错误", () => {
          assertExecutionRuntimeError(
            String.raw`\(->\(->\(->1).()).()).()`,
            "越过外加限制「调用次数」（允许 2 次）",
            { restrictions },
          );
        });
      });
      describe("通常函数", () => {
        const restrictions: Restrictions = { maxCalls: 2 };
        theyAreOk([String.raw`1+1+1`], { restrictions });
        it("超过次数则返回运行时错误", () => {
          assertExecutionRuntimeError(
            String.raw`1+1+1+1`,
            "越过外加限制「调用次数」（允许 2 次）",
            { restrictions },
          );
        });
      });
    });

    describe.todo("闭包调用深度", () => { // 功能不靠谱，暂时屏蔽掉
      // const restrictions: Restrictions = { maxClosureCallDepth: 1 };
      // theyAreOk([String.raw`\(x -> x).(1)`], { restrictions });
      // describe("超过深度则返回运行时错误", () => {
      //   const table = [
      //     String.raw`\(->\(-> 1).()).()`,
      //     String.raw`\(f -> f.(f)) |> \(f -> f.(f)).()`,
      //     String.raw`[[1]] |> map \(outer -> outer |> map \(x -> x*2))`, // FIXME
      //     String.raw`\(f -> map([f], f)) |> \(f -> f.(f)).()`, // FIXME
      //   ];
      //   for (const [i, code] of table.entries()) {
      //     it(`case ${i + 1}: ${code}`, () => {
      //       assertExecutionRuntimeError(
      //         code,
      //         "越过外加限制「闭包调用深度」（允许 1 层）",
      //         { restrictions },
      //       );
      //     });
      //   }
      // });
    });
  });
});

// TODO: 同种子下结果相同
// TODO: 运行时错误
