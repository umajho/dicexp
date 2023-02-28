import { parse } from "./parse.ts";

const codes: (string | [string, boolean])[] = [
  ["~10", true],
  ["1~10", true],
  ["d10 ~ 3d8+10", true],
  ["3#d10", true],
  ["d4 # d10 ~ 3d8+10", true],

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

for (const codeRow of codes) {
  let includesSimple = false;
  let code: string;
  if (Array.isArray(codeRow)) {
    code = codeRow[0];
    includesSimple = codeRow[1];
  } else {
    code = codeRow;
  }
  if (includesSimple) {
    Deno.bench(`simple: ${code}`, () => {
      parse(code, { optimizesForSimpleCases: true });
    });
  }
  Deno.bench(code, () => {
    parse(code, { optimizesForSimpleCases: false });
  });
}
