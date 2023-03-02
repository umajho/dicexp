import { parse } from "../parsing/parse.ts";
import { execute } from "./execute.ts";

const codesSimple = [
  "~10",
  "1~10",
  "d10 ~ 3d8+10",

  String.raw`sum([1, 2, 3])`,
  String.raw`\(a, b -> a + b).(1, 2)`,
  String.raw`append(filter([10], \(_ -> false)), 100) |> head`,
  String
    .raw`\(f, n, l -> append(filter([\( -> l)], \(_ -> n == 100)), \( -> f.(f, n+1, append(l, n)))) |> head |> \(f -> f.())) |> \(f -> f.(f, 0, []))`,
];

for (const code of codesSimple) {
  const parsed = parse(code);

  Deno.bench(`${code}`, () => {
    execute(parsed);
  });
}
