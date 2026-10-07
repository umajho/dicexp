import { assert, describe, it } from "vitest";

import { Unreachable } from "@dicexp/errors";

import {
  captured,
  closure,
  Node,
  regularCall,
  value,
} from "@dicexp/nodes";

import type {
  ParsingSuiteContext,
  PerImpl,
  RowMeta,
} from "./context";
import { forImpl } from "./context";

/**
 * A row of a "must parse" table. The plain forms run under every
 * implementation, exactly as naive's tables do today; the object form adds
 * divergence data.
 */
export type ParsingOkCase =
  | string
  | [string, unknown]
  | ParsingOkCaseObject;

export interface ParsingOkCaseObject extends RowMeta {
  code: string;
  expected?: ParsingOkExpectation;
  /**
   * Per-impl override: for implementations with an entry, the row must
   * FAIL to parse instead (compat.md §3 — nova resolves names at compile
   * time, so programs referencing unknown names are parse-class errors
   * there, while naive parses them). Entry value: the exact message
   * (`undefined` → any parse error).
   */
  errorForImpl?: PerImpl<string | undefined>;
}

/**
 * What parsing `code` must produce. Absent → parses (representation not
 * compared).
 */
export type ParsingOkExpectation =
  /**
   * `parse(code)` must deep-equal `parse(equivalentTo)` — the
   * implementation-agnostic form of naive's `[code, mustParse(other)]`
   * rows. `adjust` post-processes the expected representation (e.g.
   * marking the piped call style — naive-specific; other implementations
   * must handle their own rows, e.g. via `skipFor`).
   */
  | { equivalentTo: string; adjust?: (expected: unknown) => unknown }
  /** `parse(code)` must deep-equal this representation, for every impl. */
  | { node: unknown }
  /**
   * Per-impl representations. An implementation without an entry (or with
   * an explicit `undefined` entry) is skipped — an unpinned
   * representation must never become a phantom pass.
   */
  | { nodeByImpl: PerImpl<unknown> };

/** A row of a "must fail to parse" table. */
export interface ParsingBadCase extends RowMeta {
  code: string;
  /**
   * Exact parse-error message(s) to compare. Absent (or an explicit
   * `undefined` entry) → only error-ness is asserted. This is the
   * `"div10-parse-fixes"` mechanism: nova's messages differ where
   * compat.md §10 documents parse-level fixes, so message rows pin
   * per-impl values.
   */
  message?: string | PerImpl<string | undefined>;
}

/**
 * The parsing suite, extracted from
 * `packages/naive-evaluator/test/parsing/parse.test.ts`.
 *
 * NOTE on representations: rows whose expectations compare parse
 * representations are pinned to naive's `Node` shape (tuples with explicit
 * `Node`s, `equivalentTo` rows); implementations whose `parse` returns
 * `["ok", null]` (no representation — nova) assert only that parsing
 * succeeded for such rows.
 *
 * NOTE on unknown names ("div3-compile-time-unknowns", compat.md §3):
 * rows whose programs reference unknown names (`foo`, `bar`, `baz`,
 * `$qux`, `three`, `two`, `four`, `foo?`, `d4d4`, `函数`, `甲`, and the
 * identifier-grammar rows generally) are tagged and carry
 * `errorForImpl`/`forImpl` overrides for implementations that resolve
 * names at compile time (nova: unknown names are parse-class errors;
 * naive resolves names lazily, so they parse). Each of those rows was
 * verified empirically against nova before tagging.
 */
export function defineParsingSuite(ctx: ParsingSuiteContext): void {
  describe("空白", () => {
    describe("空白不影响解析", () => {
      // 第三个元素标记 div3-compile-time-unknowns（compat.md §3）：程序
      // 引用未知名称——naive 的名称解析是惰性的（解析期不查），nova 在
      // 编译期解析名称（parse 类错误）。
      const tablePre: [string, string, boolean?][] = [
        ["1 + 1", "1+1"],
        ["1+ 1", "1+1"],
        ["1 +1", "1+1"],
        [" 1 ", "1"],
        ["foo ( bar , baz )", "foo(bar,baz)", true],
      ];
      const table: ParsingOkCase[] = tablePre.map(([a, b, div3]) =>
        div3
          ? {
            code: a,
            expected: { equivalentTo: b },
            tags: ["div3-compile-time-unknowns"],
            errorForImpl: { nova: undefined },
          }
          : { code: a, expected: { equivalentTo: b } }
      );

      for (
        const closureTestCode of [
          "foo ( | $bar , $baz | $qux )",
          "foo(|$bar,$baz|$qux)",
        ]
      ) {
        const closurePart = (/\((.*?)\)/.exec(closureTestCode)![1]!).trim();
        const expected = regularCall("function", "foo", [
          closure(["$bar", "$baz"], "$qux", closurePart),
        ]);
        // div3-compile-time-unknowns（compat.md §3）：`foo` 未知。
        table.push({
          code: closureTestCode,
          expected: { node: expected },
          tags: ["div3-compile-time-unknowns"],
          errorForImpl: { nova: undefined },
        });
      }

      theyAreOk(ctx, table);
    });
  });

  describe("全角/半角", () => {
    describe("全角/半角符号不影响解析", () => {
      // div3-compile-time-unknowns（compat.md §3）：`foo`、`bar` 未知。
      const table: [string, string, boolean?][] = [
        [
          "foo（1＋1） ／／ bar （｜ ｜ 1）",
          String.raw`foo(1+1) // bar (| | 1)`,
          true,
        ],
      ];
      theyAreOk(
        ctx,
        table.map(([a, b, div3]) =>
          div3
            ? {
              code: a,
              expected: { equivalentTo: b },
              tags: ["div3-compile-time-unknowns"],
              errorForImpl: { nova: undefined },
            }
            : { code: a, expected: { equivalentTo: b } }
        ),
      );
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
        theyAreOk(ctx, literalIntegerGoodTable);
      });
      describe("不能解析不合规的整数常量", () => {
        theyAreBad(ctx, literalIntegerBadTable);
      });
      it("可以跟在 `d` 之后", () => {
        assertOk(ctx, "d1_1", regularCall("operator", "d", [value(11)]));
      });

      describe("能解析在安全整数范围之内的常量", () => {
        theyAreOk(ctx, [
          `${Number.MAX_SAFE_INTEGER}`,
          `${Number.MIN_SAFE_INTEGER}`,
        ]);
      });
      describe("不能解析在安全整数范围之外的常量", () => {
        theyAreBad(ctx, [
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
          ctx.parse(code);
        });
      }
    });

    describe("并非纯粹数字常量的操作数需要用括号围住", () => {
      // NOTE: 由于其他运算符的优先级都比掷骰的要低，
      //       只有在其右侧的单目运算符需要注意这种情况
      theyAreOk(ctx, ["3d(+4)"]);
      theyAreBad(ctx, ["3d+4"]);
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
            // div3-compile-time-unknowns（compat.md §3）：`d4d4` 是未知变量
            // ——nova 编译期报错；naive 解析为名为 “d4d4” 的标识符。
            forImpl(ctx, {
              naive: () => assertOk(ctx, code, code),
              nova: () => assertBad(ctx, code),
            });
          });
        } else if (ok) {
          it(`case ${i + 1}: ${code} => ok`, () => {
            assertOk(ctx, code, null);
          });
        } else {
          it(`case ${i + 1}b: ${code} => error`, () => {
            assertBad(ctx, code);
          });
        }
      }
    });
  });

  describe("优先级", () => {
    // 第二个元素标记 div3-compile-time-unknowns（compat.md §3）：程序
    // 引用未知的通常函数——nova 编译期报错。
    const table: [string, boolean?][] = [
      ...["**", "^"].flatMap((expOp): [string][] => [
        [`(3d4)${expOp}(5d6)`],
        [`(d4)${expOp}(5d6)`],
        [`(not true) ${expOp} true`],
        [`3*(4${expOp}5)//(6${expOp}7)%8`],
      ]),
      ["(((3*4)//5)%6)"],
      ["(((6%5)//4)*3)"],
      ["(-3*2)"],
      ["(+3//2)"],
      ["(-3)-2"],
      ["(+3)+2"],
      ["(1+2)-3"],
      ["(1-2)+3"],
      ["(1+2)~(3-4)"],
      ["(~3)~(~2)"],
      ["(1~2)#(3~4)"],
      ["(1#2)|>three", true],
      ["(1|>two)<(3|>four)", true],
      ["(((1<2)>3)<=4)>=5"],
      ["(((1>=2)<=3)>4)<5"],
      ["(1<2)==(3<4)"],
      ["(1==2)!=3"],
      ["(1!=2)==3"],
      ["(1==2) and (3==4)"],
      ["(1 and 2) or (3 and 4)"],
    ];
    theyAreOk(
      ctx,
      table.map(([x, div3]) => {
        const code = x.replace(/[()]/g, "");
        return div3
          ? {
            code,
            expected: { equivalentTo: x },
            tags: ["div3-compile-time-unknowns"],
            errorForImpl: { nova: undefined },
          }
          : { code, expected: { equivalentTo: x } };
      }),
    );
  });

  describe("标识符", () => {
    const idPrefixes = ["$", "@", "@@", "@_"];

    describe("前缀", () => {
      describe("不能只有前缀", () => {
        theyAreBad(ctx, idPrefixes);
      });
      describe("带前缀的标识符不能以通常函数的方式调用", () => {
        theyAreBad(ctx, idPrefixes.map((p) => `${p}foo()`));
      });
      describe("带前缀的标识符可以以值的方式调用", () => {
        // div3-compile-time-unknowns（compat.md §3）：`$foo` 等是未知变量
        // ——nova 编译期报错。
        theyAreOk(
          ctx,
          idPrefixes.map((p) => ({
            code: `${p}foo.()`,
            tags: ["div3-compile-time-unknowns"],
            errorForImpl: { nova: undefined },
          })),
        );
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
              // div3-compile-time-unknowns（compat.md §3）：未知变量。
              forImpl(ctx, {
                naive: () => assertOk(ctx, id, id),
                nova: () => assertBad(ctx, id),
              });
            } else {
              assertBad(ctx, id);
            }
          });

          const fnCode = `${id}()`;
          const fnOk = prefix === "" && ok;
          it(`case ${caseNumber} for fn: ${fnCode} => ${fnOk ? "ok" : "error"}`, () => {
            if (fnOk) {
              // div3-compile-time-unknowns（compat.md §3）：未知的通常函数。
              forImpl(ctx, {
                naive: () =>
                  assertOk(ctx, fnCode, regularCall("function", id, [])),
                nova: () => assertBad(ctx, fnCode),
              });
            } else {
              assertBad(ctx, fnCode);
            }
          });
        }
      }
    });

    describe("`_`", () => {
      it("不能作为变量", () => {
        assertBad(ctx, "_");
      });
      describe("不允许除去前缀后只剩 `_`", () => {
        theyAreBad(ctx, idPrefixes.map((p) => `${p}_`));
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
            // div3-compile-time-unknowns（compat.md §3）：两种形式（作为
            // 变量与作为通常函数）都是未知名称。
            forImpl(ctx, {
              naive: () => {
                assertOk(ctx, condition, condition);
                assertOk(
                  ctx,
                  `${condition}()`,
                  regularCall("function", condition, []),
                );
              },
              nova: () => {
                assertBad(ctx, condition);
                assertBad(ctx, `${condition}()`);
              },
            });
          });
        }
      });

      describe("带前缀的标识符，前缀之后可以只有关键词字符序列", () => {
        for (const [i, prefix] of idPrefixes.entries()) {
          for (const [j, fragment] of fragmentsOfIdentifier.entries()) {
            const caseNumber = i * fragment.length + j + 1;
            const code = `${prefix}${fragment}`;
            it(`case ${caseNumber}: ${code}`, () => {
              // div3-compile-time-unknowns（compat.md §3）：未知变量。
              forImpl(ctx, {
                naive: () => assertOk(ctx, code, code),
                nova: () => assertBad(ctx, code),
              });
            });
          }
        }
      });
    });

    describe("闭包参数列表", () => {
      describe("除了 `_` 外，参数名必须以 `$` 开头", () => {
        theyAreBad(ctx, [
          String.raw`|x| 1`,
          String.raw`|@x| 1`,
          String.raw`|_x| 1`,
        ]);
        theyAreOk(ctx, [String.raw`|$x| 1`]);
      });
      describe("参数名可以是 `_`", () => {
        theyAreOk(ctx, [String.raw`|_| 1`]);
      });
    });

    describe("Unicode", () => {
      // div3-compile-time-unknowns（compat.md §3）：`函数`、`甲` 等未知。
      theyAreOk(ctx, [
        {
          code: String.raw`(|$参数| 函数($参数)).(甲#乙d丙)`,
          tags: ["div3-compile-time-unknowns"],
          errorForImpl: { nova: undefined },
        },
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
        ctx,
        table.map(([kw, arity]) => [`&${kw}/${arity}`, captured(kw, arity)]),
      );
    });

    it("能捕获以 `?` 结尾的通常函数", () => {
      // div3-compile-time-unknowns（compat.md §3）：`foo?/1` 是未知的通常
      // 函数（compat.md §3 明确提及 unknownRegularFunction）——nova 编译
      // 期报错。
      forImpl(ctx, {
        naive: () => assertOk(ctx, "&foo?/1", captured("foo?", 1)),
        nova: () => assertBad(ctx, "&foo?/1"),
      });
    });

    // // NOTE: 先前移除了 `!` 后缀，但未来可能会加回来
    // it("不能捕获以 `!` 结尾的特殊函数", () => {
    //   assertBad("&foo!/1");
    // });
  });

  describe("管道运算符", () => {
    // NOTE: 原文件里有一个未使用的 `list231` 局部变量（死代码），未随迁移保留。
    const table: [string, string][] = [
      // 一元函数
      ["[2, 3, 1] |> sort", "sort([2, 3, 1])"],
      ["[2, 3, 1] |> sort()", "sort([2, 3, 1])"],
      // 多元函数
      ["[2, 3, 1] |> append(4)", "append([2, 3, 1], 4)"],
      // 闭包简写
      [
        String.raw`[2, 3, 1] |> map (|$x| $x**2)`,
        String.raw`map([2, 3, 1], (|$x| $x**2))`,
      ],
      // 值调用
      [String.raw`10 |> (|$x| $x*2).()`, String.raw`(|$x| $x*2).(10)`],
      [
        String.raw`10 |> (|$x, $y| $x*2).(20)`,
        String.raw`(|$x, $y| $x*2).(10, 20)`,
      ],
      // 捕获
      ["10 |> &-/1.()", "&-/1.(10)"],
      ["10 |> &-/2.(20)", "&-/2.(10, 20)"],
    ];

    const tableProcessed = table.map(([actual, equivalent]) => ({
      code: actual,
      expected: { equivalentTo: equivalent, adjust: markPiped },
    }));
    theyAreOk(ctx, tableProcessed);
  });
}

function theyAreOk(
  ctx: ParsingSuiteContext,
  table: readonly ParsingOkCase[],
) {
  for (const [i, row] of table.entries()) {
    const { code, expectation, meta, errorForImpl } = normalizeOkRow(row);
    const name = `case ${i + 1}: ${code}`;
    if (meta) {
      if (meta.todoFor?.includes(ctx.impl)) {
        it.todo(name);
        continue;
      }
      if (meta.skipFor?.includes(ctx.impl)) {
        it.skip(name, () => {});
        continue;
      }
    }
    if (errorForImpl !== undefined && ctx.impl in errorForImpl) {
      // compat.md §3: this impl rejects the program at "parse" time.
      it(name, () => {
        assertBad(ctx, code, errorForImpl[ctx.impl]);
      });
      continue;
    }
    if (expectation !== undefined && "nodeByImpl" in expectation) {
      const node = expectation.nodeByImpl[ctx.impl];
      if (node === undefined) {
        // No pinned representation for this impl — skip rather than let
        // any parse result pass.
        it.skip(name, () => {});
        continue;
      }
      it(name, () => {
        assertOk(ctx, code, node);
      });
      continue;
    }
    it(name, () => {
      // A parse result of `["ok", null]` means the impl has no parse
      // representation (nova) — for such impls, representation-comparing
      // rows assert only that parsing succeeded (never resolve the
      // expectation: the canonical side may be a different program).
      const probe = ctx.parse(code);
      if (probe[0] === "ok" && probe[1] === null) {
        return;
      }
      const expected = resolveExpected(ctx, expectation);
      assertOk(ctx, code, expected);
    });
  }
}

function mustParse(ctx: ParsingSuiteContext, code: string): unknown {
  const parseResult = ctx.parse(code);
  if (parseResult[0] === "error") {
    throw new Unreachable(`解析错误：${parseResult[1].message}`);
  }
  // result[0] === "ok"
  return parseResult[1];
}

function assertOk(
  ctx: ParsingSuiteContext,
  code: string,
  expected: unknown | null,
) {
  const result = ctx.parse(code);

  if (result[0] === "error") {
    assert(false, `error: ${result[1].message}`);
  }
  // result[0] === "ok"
  if (result[1] === null) {
    // No parse representation (see `ParseResultForTest`) — ok-ness is all
    // this impl can assert for representation-comparing rows.
    return;
  }
  if (expected) {
    assert.deepEqual(result[1], expected);
  }
}

function theyAreBad(
  ctx: ParsingSuiteContext,
  table: readonly (string | ParsingBadCase)[],
) {
  for (const [i, row] of table.entries()) {
    const { code, message, meta } = normalizeBadRow(row);
    const name = `case ${i + 1}: ${code}`;
    if (meta) {
      if (meta.todoFor?.includes(ctx.impl)) {
        it.todo(name);
        continue;
      }
      if (meta.skipFor?.includes(ctx.impl)) {
        it.skip(name, () => {});
        continue;
      }
    }
    it(name, () => {
      assertBad(ctx, code, resolveMessage(ctx.impl, message));
    });
  }
}

function assertBad(
  ctx: ParsingSuiteContext,
  code: string,
  message?: string,
) {
  const result = ctx.parse(code);
  assert(result[0] === "error");
  if (message !== undefined) {
    assert.deepEqual(result[1].message, message);
  }
}

/** Marks a parsed regular/value call as piped (naive's `Node` metadata). */
function markPiped(parsed: unknown): unknown {
  const node = parsed as Node;
  if (typeof node === "string" || !("style" in node)) {
    throw new Unreachable();
  }
  node.style = "piped";
  return node;
}

interface NormalizedOkRow {
  code: string;
  /** `undefined` → not compared (parses). */
  expectation: ParsingOkExpectation | undefined;
  meta: RowMeta | undefined;
  errorForImpl: PerImpl<string | undefined> | undefined;
}

function normalizeOkRow(row: ParsingOkCase): NormalizedOkRow {
  if (typeof row === "string") {
    return {
      code: row,
      expectation: undefined,
      meta: undefined,
      errorForImpl: undefined,
    };
  }
  if (Array.isArray(row)) {
    return {
      code: row[0],
      expectation: row[1] === null || row[1] === undefined
        ? undefined
        : { node: row[1] },
      meta: undefined,
      errorForImpl: undefined,
    };
  }
  return {
    code: row.code,
    expectation: row.expected,
    meta: row,
    errorForImpl: row.errorForImpl,
  };
}

function resolveExpected(
  ctx: ParsingSuiteContext,
  expectation: ParsingOkExpectation | undefined,
): unknown | null {
  if (expectation === undefined) {
    // 如同原本的实现：不比较解析结果。
    return null;
  }
  if ("equivalentTo" in expectation) {
    const expected = mustParse(ctx, expectation.equivalentTo);
    return expectation.adjust?.(expected) ?? expected;
  }
  if ("node" in expectation) {
    return expectation.node;
  }
  // nodeByImpl 的跳过逻辑由调用方（theyAreOk）处理；走到这里即不可能。
  return null;
}

interface NormalizedBadRow {
  code: string;
  message: string | PerImpl<string | undefined> | undefined;
  meta: RowMeta | undefined;
}

function normalizeBadRow(row: string | ParsingBadCase): NormalizedBadRow {
  if (typeof row === "string") {
    return { code: row, message: undefined, meta: undefined };
  }
  return { code: row.code, message: row.message, meta: row };
}

function resolveMessage(
  impl: ParsingSuiteContext["impl"],
  message: string | PerImpl<string | undefined> | undefined,
): string | undefined {
  if (message === undefined || typeof message === "string") {
    return message;
  }
  if (impl in message) {
    return message[impl];
  }
  return undefined;
}
