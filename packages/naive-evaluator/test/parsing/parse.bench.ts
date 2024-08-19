import { bench } from "vitest";

import { parse } from "../../src/parsing/mod";

const codes: string[] = [
  "~10",
  "1~10",
  "d10 ~ 3d8+10",
  "3#d10",
  "d4 # d10 ~ 3d8+10",
  "3#d10",
  "[1, 2, 3]",
  "sum([1, 2, 3])",
  "3#d10 |> sort",
  String.raw`3d10 |> map (|$x| $x*2)`,
  "explode(3d10, 8)",
  String.raw`explode(3d10, (|$x|$x>= 8))`,
  String.raw`3d10 |> explode (|$x| $x>=8)`,
  "3#d10 |> map(&-/1)",
];

for (const code of codes) {
  bench(code, () => {
    const result = parse(code);
    if (result[0] === "error") throw result[1];
  });
}
