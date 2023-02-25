import { parse } from "./parse.ts";
import { simpleParse } from "./parse_simple.ts";

const codes = [
  "~10",
  "1~10",
  "d10 ~ 3d8+10",
  "3#d10",
  "[1, 2, 3]",
  "sum([1, 2, 3])",
  "3#d10 |> sort",
  "3d10 |> map \\(x -> x*2)",
  "explode(3d10, 8)",
  "explode(3d10, \\(x-> x>= 8))",
  "3d10 |> explode \\(x -> x>=8)",
  "3#d10 |> map(&-/1)",
];

for (const code of codes) {
  Deno.bench(code, () => {
    parse(code, { optimizesForSimpleCases: false });
  });
}

const codesSimple = [
  "~10",
  "1~10",
  "d10 ~ 3d8+10",
  "3#d10",
  "d4 # d10 ~ 3d8+10",
];

for (const code of codesSimple) {
  Deno.bench(`simple: ${code}`, () => {
    simpleParse("code");
  });
}
