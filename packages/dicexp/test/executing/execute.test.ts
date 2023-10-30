import { assert, describe, it } from "vitest";

import {
  assertExecutionOk,
  assertExecutionRuntimeError,
  assertNumber,
  assertResultsAreRandom,
  evaluateForTest,
  theyAreOk,
} from "@dicexp/test-utils-for-executing";

import { createRuntimeError } from "@dicexp/runtime/runtime-errors";
import { makeFunction } from "@dicexp/runtime/regular-functions";
import { asScope, Scope } from "@dicexp/runtime/scopes";

import * as builtins from "@dicexp/builtins/internal";

import { JSValue } from "../../src/executing/mod";
import { Restrictions } from "../../src/executing/restrictions";
import { flatten } from "./utils";

import { testScope as topLevelScope } from "./test-scope";

describe("值", () => {
  describe("整数", () => {
    describe("可以解析整数", () => {
      theyAreOk<number>([
        ["1", 1],
      ], { topLevelScope });
    });
  });

  describe("布尔", () => {
    describe("可以解析布尔", () => {
      theyAreOk<boolean>([
        ["true", true],
        ["false", false],
      ], { topLevelScope });
    });
  });

  describe("列表", () => {
    describe("可以解析列表", () => {
      theyAreOk<JSValue[]>([
        ["[]", []],
        ["[true]", [true]],
        ["[1, 2, 3]", [1, 2, 3]],
      ], { topLevelScope });
    });
  });

  describe("生成器", () => {
    describe("范围生成器", () => {
      describe("~/2", () => {
        it("保证生成的数在范围内", () => {
          const lower = 10;
          const code = `${lower}~${lower * 2}`;
          for (let j = 0; j < 100; j++) {
            const result = assertNumber(
              evaluateForTest(code, { topLevelScope }),
            );

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
          assertResultsAreRandom(code, { topLevelScope });
        });
      });
      describe("~/1", () => {
        it("保证生成的数在范围内", () => {
          const upper = 10;
          const code = `~${upper}`;
          for (let j = 0; j < 100; j++) {
            const result = assertNumber(
              evaluateForTest(code, { topLevelScope }),
            );
            assert(
              result >= 1 && result <= upper,
              `\`${code}\` => ${result}`,
            );
          }
        });
        it("保证生成的是随机数", () => {
          const upper = 1000000;
          const code = `~${upper}`;
          assertResultsAreRandom(code, { topLevelScope });
        });
      });

      describe("d/1 与 d/2", () => {
        it("保证生成的数在范围内", () => {
          for (const isBinary of [false, true]) {
            const upper = 10;
            const times = isBinary ? 100 : 1;
            const code = `${isBinary ? 100 : ""}d${upper}`;

            for (let j = 0; j < 100; j++) {
              const result = assertNumber(
                evaluateForTest(code, { topLevelScope }),
              );
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
          assertResultsAreRandom(code, { topLevelScope });
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
        it.todo("`d(2**32+1)` 不会死循环");
      });
    });
  });

  describe("函数", () => {
    describe("通常函数", () => {
      describe("可以用", () => {
        theyAreOk<JSValue>([
          ["sum([1, 2, 3])", 6],
          ["zip([1, 2], [3, 4])", [[1, 3], [2, 4]]],
          ["[1, 2, 3] |> head", 1],
          ["[1, 2, 3] |> tail()", [2, 3]],
        ], { topLevelScope });
      });

      describe.todo("错误处理", () => {
      });
    });

    describe("运算符转函数", () => {
      describe("可以用", () => {
        theyAreOk([
          ["map([1, 2], &-/1)", [-1, -2]],
          ["zipWith([1, 2], [3, 4], &*/2)", [3, 8]],
        ], { topLevelScope });
      });
    });

    describe("闭包", () => {
      describe("可以用", () => {
        theyAreOk<JSValue>([
          [String.raw`[2, 3, 5, 7] |> filter(\($x -> $x >= 5))`, [5, 7]],
          [String.raw`[2, 3, 5, 7] |> filter \($x -> $x >= 5)`, [5, 7]],
          [String.raw`\($a, $b -> $a + $b).(1, 2)`, 3],
          [String.raw`append(filter([10], \(_ -> false)), 100) |> head`, 100],
          [String.raw`append(filter([10], \(_ -> true)), 100) |> head`, 10],
          [
            String
              .raw`\($f, $n, $l -> append(filter([\( -> $l)], \(_ -> $n == 100)), \( -> $f.($f, $n+1, append($l, $n)))) |> head |> \($f -> $f.()).()) |> \($f -> $f.($f, 0, [])).()`,
            Array(100).fill(null).map((_, i) => i), // 0..<100
          ],
          // 等到惰性求值时：
          // [
          //   String
          //     .raw`\($f, $n, $l -> append(filter([$l], \(_ -> $n == 100)), $f.($f, $n+1, append($l, $n))) |> head) |> \($f -> $f.($f, 0, []))`,
          //   Array(100).fill(null).map((_, i) => i), // 0..<100
          // ],
        ], { topLevelScope });
      });
      describe("在参数数量不匹配时报错", () => {
        const table: [string, number, number][] = [
          [String.raw`\($x -> $x).()`, 1, 0],
          [String.raw`\( -> 1).(42)`, 0, 1],
        ];
        for (const [i, [code, expected, actual]] of table.entries()) {
          it(`case ${i + 1}: ${code}`, () => {
            assertExecutionRuntimeError(
              code, // FIXME: 闭包名
              createRuntimeError.wrongArity(expected, actual, "closure"),
              { topLevelScope },
            );
          });
        }
      });
      it("不能有重复的参数名", () => {
        assertExecutionRuntimeError(
          String.raw`\($foo, $bar, $foo -> 0).(1, 2, 3)`,
          createRuntimeError.duplicateClosureParameterNames("$foo"),
          { topLevelScope },
        );
      });
      it("内外同名参数不算重复", () => {
        assertExecutionOk(
          String.raw`\($x -> $x |> \($x -> $x).()).(1)`,
          1,
          { topLevelScope },
        );
      });
      describe("无视名为 `_` 的参数", () => {
        it("重复出现多次也没问题", () => {
          assertExecutionOk(
            String.raw`\(_, $x, _ -> $x).(1, 2, 3)`,
            2,
            { topLevelScope },
          );
        });
        // NOTE: 现在 `_` 作为变量是解析错误
      });
    });
  });
});

describe("运算符", () => {
  // 作为函数定义的运算符，于 `@dicexp/builtin` 库中测试。
  // 管道运算符（`|>`）是特殊的构造，在运行时中并非运算符，因此不属于这里。

  describe("#/2", () => {
    describe("将右侧内容在 eval 前反复左侧次", () => {
      it("反复字面量", () => {
        assertExecutionOk("3#10", Array(3).fill(10), { topLevelScope });
      });
    });
    describe("反复数组取值正常", () => {
      theyAreOk([["10#([1]|>at(0))", Array(10).fill(1)]], { topLevelScope });
    });
    describe("结果作为参数传入函数正常", () => {
      theyAreOk([["10#true |> count(&not/1)", 0]], { topLevelScope });
    });

    // 测试 “重复求值结果不同” 放在了 “语义” 那里
  });
});

describe("语义", () => {
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
    const longListOfXs = "[" + Array(1000).fill("$x").join(", ") + "]";
    const table = exps
      .map((exp) => String.raw`${exp} |> \($x -> ${longListOfXs}).()`);

    for (const [i, code] of table.entries()) {
      it(`case ${i + 1}: ${code}`, () => {
        const result = assertExecutionOk(code, undefined, { topLevelScope });
        const resultFlatten = flatten(result as any, Infinity) as number[];
        assert(resultFlatten.every((el) => Number.isFinite(el)));
        assert.deepEqual((new Set(resultFlatten)).size, 1);
      });
    }

    it.todo("不会致使死循环", () => {
      // 来自 bench 中的最后一个例子
      // TODO: 最小复现
      const yCombinator = String
        .raw`\($fn -> \($f -> $fn.(\($x -> $f.($f).($x)))).(\($f -> $fn.(\($x -> $f.($f).($x))))))`;
      const code = String
        .raw`\($Y, $g -> $Y.($g).([0, []])).(${yCombinator}, \($f -> \($nl -> if(($nl|>at(0)) == 100, $nl|>at(1), $f.([($nl|>at(0))+1, append(($nl|>at(1)), $nl|>at(0))])))))`;
    });
  });

  describe("重复求值结果不同", () => {
    const table = exps.map((exp) => `1000#${exp}`);
    table.push(...[
      // 闭包内部的参数具名，但调用闭包并非具名
      String.raw`1000#\($x->$x).(${SUPER_BIG_DIE})`,
    ]);

    for (const [i, code] of table.entries()) {
      it(`case ${i + 1}: ${code}`, () => {
        const result = assertExecutionOk(code, undefined, { topLevelScope });
        const resultFlatten = flatten(result as any, Infinity);
        assert(resultFlatten.every((el) => Number.isFinite(el)));
        assert((new Set(resultFlatten)).size > 1);
      });
    }
  });
});

describe("从管道的测试那里移过来的", () => {
  theyAreOk([
    ["[2, 3, 1] |> sort", [1, 2, 3]],
    ["[2, 3, 1] |> sort()", [1, 2, 3]],
    ["[2, 3, 1] |> append(4)", [2, 3, 1, 4]],
    [String.raw`[2, 3, 1] |> map \($x -> $x**2)`, [4, 9, 1]],
    [String.raw`10 |> \($x -> $x*2).()`, 20],
    [String.raw`10 |> \($x, $y -> $x*2).(20)`, 20],
    ["10 |> &-/1.()", -10],
    ["10 |> &-/2.(20)", -10],
  ] as [string, JSValue][], { topLevelScope });
});

describe("限制", () => {
  describe("内在限制", () => {
    describe("整数", () => {
      it("不能允许大于 `Number.MAX_SAFE_INTEGER` 的整数", () => {
        const safe = Number.MAX_SAFE_INTEGER;

        assertExecutionOk(`${safe}`, safe, { topLevelScope });
        // 解析错误
        // assertExecutionRuntimeError(
        //   `${safe + 1}`,
        //   "越过内在限制「最大安全整数」（允许 9007199254740991）",
        // );
        assertExecutionRuntimeError(
          `${safe} + 1`,
          "越过内在限制「最大安全整数」（允许 9007199254740991）",
          { topLevelScope },
        );
      });
      it("不能允许小于 `Number.MIN_SAFE_INTEGER` 的整数", () => {
        const safe = Number.MIN_SAFE_INTEGER;

        assertExecutionOk(`${safe}`, safe, { topLevelScope });
        // 解析错误
        // assertExecutionRuntimeError(
        //   `${safe - 1}`,
        //   "越过内在限制「最小安全整数」（允许 -9007199254740991）",
        // );
        assertExecutionRuntimeError(
          `${safe} - 1`,
          "越过内在限制「最小安全整数」（允许 -9007199254740991）",
          { topLevelScope },
        );
      });
    });
  });

  describe("外加限制", () => {
    describe("软性超时", () => { // FIXME: 应该用 fake time
      const restrictions: Restrictions = { softTimeout: { ms: 10 } };
      it("未超时则无影响", () => {
        assertExecutionOk(`${1}`, undefined, { restrictions, topLevelScope });
      });

      describe("超时则返回运行时错误", () => {
        const scope: Scope = asScope([
          builtins.operatorScope,
          {
            "sleep/1": makeFunction(
              ["integer"],
              (_rtm, ...args) => {
                const [ms] = args as [number];
                const start = performance.now();
                while (performance.now() - start <= ms) { /* noop */ }
                return ["ok", true];
              },
            ),
          },
        ]);

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
            { topLevelScope: scope, restrictions },
          );
        });
      });
    });

    describe("调用次数", () => {
      describe("闭包", () => {
        const restrictions: Restrictions = { maxCalls: 2 };
        theyAreOk(
          [String.raw`\(->\(->1).()).()`],
          { restrictions, topLevelScope },
        );
        it("超过次数则返回运行时错误", () => {
          assertExecutionRuntimeError(
            String.raw`\(->\(->\(->1).()).()).()`,
            "越过外加限制「调用次数」（允许 2 次）",
            { restrictions, topLevelScope },
          );
        });
      });
      describe("通常函数", () => {
        const restrictions: Restrictions = { maxCalls: 2 };
        theyAreOk([String.raw`1+1+1`], { restrictions, topLevelScope });
        it("超过次数则返回运行时错误", () => {
          assertExecutionRuntimeError(
            String.raw`1+1+1+1`,
            "越过外加限制「调用次数」（允许 2 次）",
            { restrictions, topLevelScope },
          );
        });
      });
    });

    describe.skip("闭包调用深度", () => { // 功能不靠谱，暂时屏蔽掉
      // const restrictions: Restrictions = { maxClosureCallDepth: 1 };
      // theyAreOk([String.raw`\(x -> x).(1)`], { restrictions });
      // describe("超过深度则返回运行时错误", () => {
      //   const table = [
      //     String.raw`\(->\(-> 1).()).()`,
      //     String.raw`\($f -> $f.($f)) |> \($f -> $f.($f)).()`,
      //     String.raw`[[1]] |> map \($outer -> $outer |> map \($x -> $x*2))`, // FIXME
      //     String.raw`\($f -> map([$f], $f)) |> \($f -> $f.($f)).()`, // FIXME
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
