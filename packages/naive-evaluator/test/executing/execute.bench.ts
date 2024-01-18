import { bench, describe } from "vitest";

// @ts-ignore
import { prng_xorshift7 } from "esm-seedrandom";

import { Unreachable } from "@dicexp/errors";

import { parse, ParseResult } from "../../src/parsing/mod";
import {
  asScope,
  execute,
  ExecutionResult,
  RandomGenerator,
  RandomSource,
} from "../../src/executing/mod";

import * as builtins from "@dicexp/naive-evaluator-builtins/internal";

const topLevelScope = asScope([builtins.operatorScope, builtins.functionScope]);

describe("各种表达式", () => {
  const codes = [
    "~10",
    "1~10",
    "d9007199254740991",
    "d10 ~ 3d8+10",

    String.raw`sum([1, 2, 3])`,
    String.raw`\($a, $b -> $a + $b).(1, 2)`,

    String.raw`100#any?(3#(d100<=5)) |> count \($x -> not $x)`,

    // 模拟 if-else（现在已经不需要了），速度竟然差不多
    String.raw`append(filter([10], \(_ -> false)), 100) |> head`,
    ...[ // FIXME: 重新实现 `if/*`
      // String.raw`if(false, 10, 100)`,
    ],

    // 0..<99
    String
      .raw`\($f, $n, $l -> append(filter([\( -> $l)], \(_ -> $n == 100)), \( -> $f.($f, $n+1, append($l, $n)))) |> head |> \($f -> $f.()).()) |> \($f -> $f.($f, 0, [])).()`,
    ...[ // FIXME: 重新实现 `if/*`
      // String
      //   .raw`\($f, $n, $l -> if($n == 100, $l, $f.($f, $n+1, append($l, $n)))) |> \($f -> $f.($f, 0, [])).()`,
    ],

    ...(() => {
      const yCombinators = [
        String
          .raw`\($fn -> \($f -> $fn.(\($x -> $f.($f).($x)))).(\($f -> $fn.(\($x -> $f.($f).($x))))))`,
        // String.raw`\($f -> \($x -> $x.($x))).(\($x -> $f.(\($y -> $x.($x).($y)))))`,
      ];
      return yCombinators.flatMap((yCombinator) => {
        return [
          // 两例 Y 组合子：
          // see: https://zhuanlan.zhihu.com/p/51856257
          // see: https://blog.klipse.tech/lambda/2016/08/10/pure-y-combinator-javascript.html
          String
            .raw`\($if -> \($Y, $g -> $Y.($g).(10)).(${yCombinator}, \($f -> \($n -> $if.($n == 0, \(-> 0), \(-> $n + $f.($n-1))))))).(\($cond, $t, $f -> head(append(filter([$t], \(_ -> $cond)), $f)).()))`,
          ...[ // FIXME: 重新实现 `if/*`，以及其中一项应该还会导致卡死
            // // 用真正的 if-else：
            // String
            //   .raw`\($Y, $g -> $Y.($g).(10)).(${yCombinator}, \($f -> \($n -> if($n == 0, 0, $n + $f.($n-1)))))`,

            // // 0..<99，但是用 Y 组合子：
            // String
            //   .raw`\($Y, $g -> $Y.($g).([0, []])).(${yCombinator}, \($f -> \($nl -> if(($nl|>at(0)) == 100, $nl|>at(1), $f.([($nl|>at(0))+1, append(($nl|>at(1)), $nl|>at(0))])))))`,
          ],
        ];
      });
    })(),
  ];

  for (const code of codes) {
    let parseResult: ParseResult;
    try {
      parseResult = parse(code);
    } catch (e) {
      console.error(`${code}: unknown error during parsing: ${e}`);
      continue;
    }
    if (parseResult[0] === "error") {
      console.error(`${code}: parsing error: ${parseResult[1].message}`);
      continue;
    }

    const randomSource = new RandomSourceWrapper(prng_xorshift7(42));

    bench(`${code}`, () => {
      let result: ExecutionResult;
      try {
        if (parseResult[0] === "error") throw new Unreachable();
        result = execute(parseResult[1], { topLevelScope, randomSource });
      } catch (e) {
        throw new Error(`${code}: unknown error during executing: ${e}`);
      }
      if (result[0] === "error") {
        throw new Error(`${code}: runtime error: ${result[2].message}`);
      }
    });
  }
});

describe("d100 vs 直接生成随机数", () => {
  const randomSourceA = new RandomSourceWrapper(prng_xorshift7(42));
  const randomSourceB = new RandomSourceWrapper(prng_xorshift7(42));

  const d100Parsed = parse("d100");
  if (d100Parsed[0] === "error") throw new Unreachable();

  const rng = new RandomGenerator(randomSourceB);

  bench("d100", () => {
    execute(d100Parsed[1], { topLevelScope, randomSource: randomSourceA });
  });
  bench("用 RandomGenerator 生成 1 到 100 之间的随机数", () => {
    rng.integer(1, 100);
  });
});

// 来自 evaluate.ts
class RandomSourceWrapper implements RandomSource {
  rng: { int32: () => number };

  constructor(rng: { int32: () => number }) {
    this.rng = rng;
  }

  uint32(): number {
    return this.rng.int32() >>> 0;
  }
}
