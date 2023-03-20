import { parse } from "../parsing/parse.ts";
import { execute } from "./execute.ts";

const codesSimple = [
  "~10",
  "1~10",
  "d10 ~ 3d8+10",

  String.raw`sum([1, 2, 3])`,
  String.raw`\(a, b -> a + b).(1, 2)`,

  String.raw`100#any?(3#(d100<=5)) |> count \(x -> not x)`,

  // 模拟 if-else（现在已经不需要了），速度竟然差不多
  String.raw`append(filter([10], \(_ -> false)), 100) |> head`,
  String.raw`if!(false, 10, 100)`,

  // 0..<99
  String
    .raw`\(f, n, l -> append(filter([\( -> l)], \(_ -> n == 100)), \( -> f.(f, n+1, append(l, n)))) |> head |> \(f -> f.())) |> \(f -> f.(f, 0, []))`,
  String
    .raw`\(f, n, l -> if!(n == 100, l, f.(f, n+1, append(l, n)))) |> \(f -> f.(f, 0, []))`,

  ...(() => {
    const yCombinators = [
      String
        .raw`\(fn -> \(f -> fn.(\(x -> f.(f).(x)))).(\(f -> fn.(\(x -> f.(f).(x))))))`,
      String.raw`\(f -> \(x -> x.(x))).(\(x -> f.(\(y -> x.(x).(y)))))`,
    ];
    return yCombinators.flatMap((yCombinator) => {
      return [
        // 两例 Y 组合子：
        // see: https://zhuanlan.zhihu.com/p/51856257
        // see: https://blog.klipse.tech/lambda/2016/08/10/pure-y-combinator-javascript.html
        String
          .raw`\(if -> \(Y, g -> Y.(g).(10)).(${yCombinator}, \(f -> \(n -> if.(n == 0, \(-> 0), \(-> n + f.(n-1))))))).(\(cond, t, f -> head(append(filter([t], \(_ -> cond)), f)).()))`,
        // 用真正的 if-else：
        String
          .raw`\(Y, g -> Y.(g).(10)).(${yCombinator}, \(f -> \(n -> if!(n == 0, 0, n + f.(n-1)))))`,

        // 0..<99，但是用 Y 组合子：
        String
          .raw`\(Y, g -> Y.(g).([0, []])).(${yCombinator}, \(f -> \(nl -> if!((nl|>at(0)) == 100, nl|>at(1), f.([(nl|>at(0))+1, append((nl|>at(1)), nl|>at(0))])))))`,
      ];
    });
  })(),
];

for (const code of codesSimple) {
  const parsed = parse(code);

  Deno.bench(`${code}`, () => {
    execute(parsed);
  });
}
