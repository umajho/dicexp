import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
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

describe("掷骰的操作数", () => {
  describe("一般情况没问题", () => {
    const table = [
      "d4",
      "3d4",
      "2+3d4*5",
      "d-4",
      "3d+4",
    ];
    for (const [i, code] of table.entries()) {
      it(`case ${i + 1}: ${code}`, () => {
        parse(code);
      });
    }
  });

  describe("但是连用需要用括号确定优先级", () => {
    const table = [
      "(d4)d4",
      "3d(4d5)",
    ];
    for (const [i, code] of table.entries()) {
      it(`case ${i + 1}a: ${code} => ok`, () => {
        parse(code);
      });
      const codeWithoutParens = code.replaceAll(/[()]/g, "");
      it(`case ${i + 1}b: ${codeWithoutParens} => error`, () => {
        assertThrows(() => parse(codeWithoutParens));
      });
    }
  });
});

describe("优先级", () => {
  const table: string[] = [
    "(3d4)^(5d6)",
    "(d4)^(5d6)",
    "(!true) ^ true",
    "3*(4^5)//(6^7)%8",
    "(((3*4)//5)%6)",
    "(((6%5)//4)*3)",
    "-(3*2)",
    "+(3//2)",
    "(-3)-2",
    "(+3)+2",
    "(1+2)-3",
    "(1-2)+3",
    "(1+2)~(3-4)",
    "(~3)~(~2)",
    "(1~2)#(3~4)",
    "(1#2)|>(3#4)",
    "(1|>2)<(3|>4)",
    "(((1<2)>3)<=4)>=5",
    "(((1>=2)<=3)>4)<5",
    "(1<2)==(3<4)",
    "(1==2)!=3",
    "(1!=2)==3",
    "(1==2)&&(3==4)",
    "(1&&2)||(3&&4)",
  ];
  for (const [i, withParens] of table.entries()) {
    const withoutParens = withParens.replaceAll(/[()]/g, "");
    it(`case ${i + 1}: \`${withoutParens}\` == \`${withParens}\``, () => {
      assertEquals(parse(withoutParens), parse(withParens));
    });
  }
});

describe("不能把单独的 `d` 作为标识符", () => {
  it("`d` 不能作为匿名函数形式参数", () => {
    assertThrows(() => parse(String.raw`\(d -> 1).(1)`));
  });
  describe("更长的名称则没问题", () => {
    const table = [
      "da",
      "dd",
      "ad",
      "ada",
      "a",
    ];
    for (const [i, id] of table.entries()) {
      it(`case ${i + 1}: ${id}`, () => {
        parse(String.raw`\(${id} -> 1).(1)`);
      });
    }
  });
});
