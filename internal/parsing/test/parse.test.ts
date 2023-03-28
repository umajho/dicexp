import { assert, describe, it } from "vitest";

import { parse } from "../src/parse";
import { simpleParse } from "src/parse_simple";

import { captured, list, Node, regularCall, value } from "@dicexp/nodes";
import { Unreachable } from "src/errors";

describe("空白", () => {
  describe("空白不影响解析", () => {
    const table: [string, string][] = [
      ["1 + 1", "1+1"],
      [" 1 ", "1"],
      ["foo ( bar , baz )", "foo(bar,baz)"],
      [String.raw`foo \( bar , baz -> qux )`, String.raw`foo\(bar,baz->qux)`],
    ];
    theyAreOk(table.map(([a, b]) => [a, parse(b)]));
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
    theyAreOk(table.map(([a, b]) => [a, parse(b)]));
  });
});

const integerLiteralTable: [string, Node][] = [
  ["1", value(1)],
  ["1_000_000", value(1_000_000)],
];

describe("简单解析", () => {
  it("不接受右侧有悬挂的正负号", () => {
    assert.isFalse(simpleParse("1+"));
  });

  it("能够正确解析合规的整数常量", () => {
    theyAreOk(integerLiteralTable, simpleParse);
  });
});

describe("常量", () => {
  describe("整数常量", () => {
    it("能够正确解析合规的整数常量", () => {
      theyAreOk(integerLiteralTable);
    });
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
      const codeWithoutParens = code.replace(/[()]/g, "");
      it(`case ${i + 1}b: ${codeWithoutParens} => error`, () => {
        assert.throw(() => parse(codeWithoutParens));
      });
    }
  });

  describe("右操作数是整数时，该操作数之前的正负号不会产生多余的节点", () => {
    const table: [string, Node][] = [
      ["d+10", parse("d10")],
      ["3d+10", parse("3d10")],
      ["d-10", regularCall("operator", "d", [value(-10)])],
      ["3d-10", regularCall("operator", "d", [value(3), value(-10)])],
    ];
    theyAreOk(table);
  });
});

describe("优先级", () => {
  const table: string[] = [
    "(3d4)^(5d6)",
    "(d4)^(5d6)",
    "(not true) ^ true",
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
    "(1#2)|>three",
    "(1|>two)<(3|>four)",
    "(((1<2)>3)<=4)>=5",
    "(((1>=2)<=3)>4)<5",
    "(1<2)==(3<4)",
    "(1==2)!=3",
    "(1!=2)==3",
    "(1==2) and (3==4)",
    "(1 and 2) or (3 and 4)",
  ];
  theyAreOk(table.map((x) => [x.replace(/[()]/g, ""), parse(x)]));
});

describe("标识符", () => {
  describe("一般", () => {
    const table: { id: string; var: boolean; fn: boolean }[] = [
      { id: "foo", var: true, fn: true },
      { id: "foo!", var: false, fn: true },
      { id: "foo?", var: false, fn: true },
      { id: "_a1", var: true, fn: true },
      { id: "1a", var: false, fn: false },
    ];
    for (const [i, { id, var: varOk, fn: fnOk }] of table.entries()) {
      it(`case ${i + 1} for var: ${id} => ${varOk ? "ok" : "error"}`, () => {
        if (varOk) {
          parse(id);
        } else {
          assert.throw(() => parse(id));
        }
      });
      const fnCode = `${id}()`;
      it(`case ${i + 1} for fn: ${fnCode} => ${fnOk ? "ok" : "error"}`, () => {
        if (fnOk) {
          parse(fnCode);
        } else {
          assert.throw(() => parse(fnCode));
        }
      });
    }
  });

  describe("不能把单独的 `d` 作为标识符", () => {
    it("`d` 不能作为匿名函数形式参数", () => {
      assert.throw(() => parse(String.raw`\(d -> 1).(1)`));
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

  describe("名称中含有关键词", () => {
    const table: string[] = [
      "true1",
      "trueA",
      "_true",
      "trueortrue",
      "nottrue",
    ];
    for (const [i, id] of table.entries()) {
      it(`case ${i + 1} for var: ${id}`, () => {
        assert.deepEqual(parse(id), id);
      });
      const fnCode = `${id}()`;
      it(`case ${i + 1} for fn: ${fnCode}`, () => {
        assert.deepEqual(parse(fnCode), regularCall("function", id, []));
      });
    }
  });
});

describe("捕获", () => {
  describe("能捕获同时作为关键词的通常函数", () => {
    const table: [string, number][] = [
      ["and", 2],
      ["or", 2],
      ["not", 1],
    ];
    theyAreOk(
      table.map(([kw, arity]) => [`&${kw}/${arity}`, captured(kw, arity)]),
    );
  });

  it("能捕获以 `?` 结尾的通常函数", () => {
    assert.deepEqual(parse("&foo?/1"), captured("foo?", 1));
  });

  it("不能捕获以 `!` 结尾的特殊函数", () => {
    assert.throw(() => parse("&foo!/1"));
  });
});

describe("管道运算符", () => {
  const list231 = list([value(2), value(3), value(1)]);
  const table: [string, string][] = [
    // 一元函数
    ["[2, 3, 1] |> sort", "sort([2, 3, 1])"],
    ["[2, 3, 1] |> sort()", "sort([2, 3, 1])"],
    // 多元函数
    ["[2, 3, 1] |> append(4)", "append([2, 3, 1], 4)"],
    // 闭包简写
    [
      String.raw`[2, 3, 1] |> map \(x -> x^2)`,
      String.raw`map([2, 3, 1], \(x -> x^2))`,
    ],
    // 值调用
    [String.raw`10 |> \(x -> x*2).()`, String.raw`\(x -> x*2).(10)`],
    [
      String.raw`10 |> \(x, y -> x*2).(20)`,
      String.raw`\(x, y -> x*2).(10, 20)`,
    ],
    // 捕获
    ["10 |> &-/1.()", "&-/1.(10)"],
    ["10 |> &-/2.(20)", "&-/2.(10, 20)"],
  ];

  const tableProcessed = table.map(([actual, equivalent]) => {
    const parsed = parse(equivalent);
    if (typeof parsed === "string" || !("style" in parsed)) {
      throw new Unreachable();
    }
    parsed.style = "piped";
    return [actual, parsed] as [string, Node];
  });
  theyAreOk(tableProcessed);
});

function theyAreOk(
  table: [string, Node][],
  parseFn: (code: string) => false | Node = parse,
) {
  for (const [i, [code, expected]] of table.entries()) {
    it(`case ${i + 1}: ${code}`, () => {
      assert.deepEqual(parseFn(code), expected);
    });
  }
}
