import { assert, describe, it } from "vitest";

import { parse, ParseResult } from "../lib";

import {
  captured,
  closure,
  list,
  Node,
  regularCall,
  value,
} from "@dicexp/nodes";
import { Unreachable } from "@dicexp/errors";

describe("空白", () => {
  describe("空白不影响解析", () => {
    const tablePre: [string, string][] = [
      ["1 + 1", "1+1"],
      ["1+ 1", "1+1"],
      ["1 +1", "1+1"],
      [" 1 ", "1"],
      ["foo ( bar , baz )", "foo(bar,baz)"],
    ];
    const table: [string, Node][] = tablePre.map(([a, b]) => [a, mustParse(b)]);

    for (
      const closureTestCode of [
        String.raw`foo \( $bar , $baz -> $qux )`,
        String.raw`foo\($bar,$baz->$qux)`,
      ]
    ) {
      const closurePart = closureTestCode.slice(closureTestCode.indexOf("\\"));
      const expected = regularCall("function", "foo", [
        closure(["$bar", "$baz"], "$qux", closurePart),
      ]);
      table.push([closureTestCode, expected]);
    }

    theyAreOk(table);
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
    theyAreOk(table.map(([a, b]) => [a, mustParse(b)]));
  });
});

const literalIntegerGoodTable: [string, Node][] = [
  ["1", value(1)],
  ["1_000_000", value(1_000_000)],
];
const literalIntegerBadTable: string[] = [
  "1_",
  "1__1",
];

describe("常量", () => {
  describe("整数常量", () => {
    describe("能够正确解析合规的整数常量", () => {
      theyAreOk(literalIntegerGoodTable);
    });
    describe("不能解析不合规的整数常量", () => {
      theyAreBad(literalIntegerBadTable);
    });
    it("可以跟在 `d` 之后", () => {
      assertOk("d1_1", regularCall("operator", "d", [value(11)]));
    });

    describe("能解析在安全整数范围之内的常量", () => {
      theyAreOk([
        `${Number.MAX_SAFE_INTEGER}`,
        `${Number.MIN_SAFE_INTEGER}`,
      ]);
    });
    describe("不能解析在安全整数范围之外的常量", () => {
      theyAreBad([
        `${Number.MAX_SAFE_INTEGER + 1}`,
        `${Number.MIN_SAFE_INTEGER - 1}`,
      ]);
    });
  });
});

describe("掷骰的操作数", () => {
  describe("一般情况没问题", () => {
    const table = [
      "d4",
      "3d4",
      "-3d4",
      "2+3d4*5",
    ];
    for (const [i, code] of table.entries()) {
      it(`case ${i + 1}: ${code}`, () => {
        parse(code);
      });
    }
  });

  describe("并非纯粹数字常量的操作数需要用括号围住", () => {
    // NOTE: 由于其他运算符的优先级都比掷骰的要低，
    //       只有在其右侧的单目运算符需要注意这种情况
    theyAreOk(["3d(+4)"]);
    theyAreBad(["3d+4"]);
  });

  describe("但是连用需要用括号确定优先级", () => {
    const table: { code: string; ok: boolean | "id" }[] = [
      { code: "(d4)d4", ok: true },
      { code: "d4d4", ok: "id" }, // 视为名为 “d4d4” 的标识符
      { code: "3d(4d5)", ok: true },
      { code: "3d4d5", ok: false },
    ];
    for (const [i, { code, ok }] of table.entries()) {
      if (ok === "id") {
        it(`case ${i + 1}: ${code} => ok (as an identifier)`, () => {
          assertOk(code, code);
        });
      } else if (ok) {
        it(`case ${i + 1}: ${code} => ok`, () => {
          assertOk(code, null);
        });
      } else {
        it(`case ${i + 1}b: ${code} => error`, () => {
          assertBad(code);
        });
      }
    }
  });
});

describe("优先级", () => {
  const table: string[] = [
    ...["**", "^"].flatMap((expOp) => [
      `(3d4)${expOp}(5d6)`,
      `(d4)${expOp}(5d6)`,
      `(not true) ${expOp} true`,
      `3*(4${expOp}5)//(6${expOp}7)%8`,
    ]),
    "(((3*4)//5)%6)",
    "(((6%5)//4)*3)",
    "(-3*2)",
    "(+3//2)",
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
  theyAreOk(table.map((x) => [x.replace(/[()]/g, ""), mustParse(x)]));
});

describe("标识符", () => {
  const idPrefixes = ["$", "@", "@@", "@_"];

  describe("前缀", () => {
    describe("不能只有前缀", () => {
      theyAreBad(idPrefixes);
    });
    describe("带前缀的标识符不能以通常函数的方式调用", () => {
      theyAreBad(idPrefixes.map((p) => `${p}foo()`));
    });
    describe("带前缀的标识符可以以值的方式调用", () => {
      theyAreOk(idPrefixes.map((p) => `${p}foo.()`));
    });
  });

  describe("一般名称", () => {
    const goodNames = ["foo", "foo?", "_a1"];
    const badNames = ["foo!", "1a"];
    const names = [
      ...goodNames.map((name) => ({ name, ok: true })),
      ...badNames.map((name) => ({ name, ok: false })),
    ];

    for (const [i, prefix] of ["", ...idPrefixes].entries()) {
      for (const [j, { name, ok }] of names.entries()) {
        const caseNumber = i * names.length + j + 1;
        const id = `${prefix}${name}`;

        it(`case ${caseNumber} for var: ${id} => ${ok ? "ok" : "error"}`, () => {
          if (ok) {
            assertOk(id, id);
          } else {
            assertBad(id);
          }
        });

        const fnCode = `${id}()`;
        const fnOk = prefix === "" && ok;
        it(`case ${caseNumber} for fn: ${fnCode} => ${fnOk ? "ok" : "error"}`, () => {
          if (fnOk) {
            assertOk(fnCode, regularCall("function", id, []));
          } else {
            assertBad(fnCode);
          }
        });
      }
    }
  });

  describe("`_`", () => {
    it("不能作为变量", () => {
      assertBad("_");
    });
    describe("不允许除去前缀后只剩 `_`", () => {
      theyAreBad(idPrefixes.map((p) => `${p}_`));
    });
  });

  describe("关键词与标识符", () => {
    // NOTE: 由于用户不再能定义不带前缀的标识符，关键词不可能与标识符重叠，
    //       因此不再能/不再需要测试 “不能重叠两者”。

    const fragmentsOfIdentifier = [
      ...["d", "d1"],
      ...[/* 单目 */ "not", /* 双目 */ "or"],
      "true",
    ];

    const goodConditions = fragmentsOfIdentifier.flatMap((c) => [
      ...(/^d\d*$/.test(c) ? [] : [`${c}1`]), // `d` 后面不能一直是数字，但其他可以是
      ...["a", "_"].flatMap((x) => [`${c}${x}`, `${x}${c}`, `${x}${c}${x}`]),
      ...[`${c}or${c}`, `not${c}`],
      `${c}${c}`,
    ]);

    describe("关键词字符序列可以作为标识符名称的一部分", () => {
      for (const [i, condition] of goodConditions.entries()) {
        it(`case ${i + 1}: \`${condition}\` & \`${condition}()\` => ok`, () => {
          assertOk(condition, condition);
          assertOk(`${condition}()`, regularCall("function", condition, []));
        });
      }
    });

    describe("带前缀的标识符，前缀之后可以只有关键词字符序列", () => {
      for (const [i, prefix] of idPrefixes.entries()) {
        for (const [j, fragment] of fragmentsOfIdentifier.entries()) {
          const caseNumber = i * fragment.length + j + 1;
          const code = `${prefix}${fragment}`;
          it(`case ${caseNumber}: ${code}`, () => {
            assertOk(code, code);
          });
        }
      }
    });
  });

  describe("闭包参数列表", () => {
    it("除了 `_` 外，参数名必须以 `$` 开头", () => {
      theyAreBad([
        String.raw`\(x -> 1)`,
        String.raw`\(@x -> 1)`,
        String.raw`\(_x -> 1)`,
      ]);
    });
    it("参数名可以是 `_`", () => {
      theyAreOk([String.raw`\($x -> 1)`]);
    });
  });

  describe("Unicode", () => {
    theyAreOk([
      String.raw`\($参数 -> 函数($参数)).(甲#乙d丙)`,
    ]);
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
    assertOk("&foo?/1", captured("foo?", 1));
  });

  // // NOTE: 先前移除了 `!` 后缀，但未来可能会加回来
  // it("不能捕获以 `!` 结尾的特殊函数", () => {
  //   assertBad("&foo!/1");
  // });
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
      String.raw`[2, 3, 1] |> map \($x -> $x**2)`,
      String.raw`map([2, 3, 1], \($x -> $x**2))`,
    ],
    // 值调用
    [String.raw`10 |> \($x -> $x*2).()`, String.raw`\($x -> $x*2).(10)`],
    [
      String.raw`10 |> \($x, $y -> $x*2).(20)`,
      String.raw`\($x, $y -> $x*2).(10, 20)`,
    ],
    // 捕获
    ["10 |> &-/1.()", "&-/1.(10)"],
    ["10 |> &-/2.(20)", "&-/2.(10, 20)"],
  ];

  const tableProcessed = table.map(([actual, equivalent]) => {
    const parsed = mustParse(equivalent);
    if (typeof parsed === "string" || !("style" in parsed)) {
      throw new Unreachable();
    }
    parsed.style = "piped";
    return [actual, parsed] as [string, Node];
  });
  theyAreOk(tableProcessed);
});

function theyAreOk(
  table: ([string, Node] | string)[],
  parseFn: (code: string) => ParseResult = parse,
) {
  for (const [i, row] of table.entries()) {
    let code: string, expected: Node | null;
    if (typeof row === "string") {
      code = row;
      expected = null;
    } else {
      [code, expected] = row;
    }
    it(`case ${i + 1}: ${code}`, () => {
      assertOk(code, expected, parseFn);
    });
  }
}

function mustParse(code: string): Node {
  const parseResult = parse(code);
  if (parseResult[0] === "error") {
    throw new Unreachable(`解析错误：${parseResult[1].message}`);
  }
  // result[0] === "ok"
  return parseResult[1];
}

function assertOk(
  code: string,
  expected: Node | null,
  parseFn: (code: string) => ParseResult = parse,
) {
  const result = parseFn(code);

  if (result[0] === "error") {
    assert(false, `error: ${result[1].message}`);
  }
  // result[0] === "ok"
  if (expected) {
    assert.deepEqual(result[1], expected);
  }
}

function theyAreBad(
  table: string[],
  parseFn: (code: string) => ParseResult = parse,
) {
  for (const [i, code] of table.entries()) {
    it(`case ${i + 1}: ${code}`, () => {
      assertBad(code, parseFn);
    });
  }
}

function assertBad(
  code: string,
  parseFn: (code: string) => ParseResult = parse,
) {
  assert(parseFn(code)[0] === "error");
}
