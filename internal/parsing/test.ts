import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.178.0/testing/bdd.ts";

import { parse } from "./parse.ts";

describe("空白", () => {
  describe("空白不影响解析", () => {
    const table: [string, string][] = [
      ["1+1", "1 + 1"],
      [" 1 ", "1"],
      ["foo ( bar , baz )", "foo(bar,baz)"],
      [String.raw`foo \( bar , baz -> qux )`, String.raw`foo\(bar,baz->qux)`],
    ];
    for (const [i, [withSpaces, withoutSpaces]] of table.entries()) {
      it(`case ${i + 1}: ${withSpaces}`, () => {
        assertEquals(parse(withSpaces), parse(withoutSpaces));
      });
    }
  });
});

describe("全角/半角", () => {
  describe("全角/半角符号不影响解析", () => {
    const table: [string, string][] = [
      [
        "foo（1＋1） ／／ bar ＼（＿ －＞ 1）",
        String.raw`foo(1+1) // bar \(_ -> 1)`,
      ],
    ];
    for (const [i, [full, half]] of table.entries()) {
      it(`case ${i + 1}: ${full}`, () => {
        assertEquals(parse(full), parse(half));
      });
    }
  });
});
