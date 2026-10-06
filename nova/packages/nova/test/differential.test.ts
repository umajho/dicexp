/**
 * Differential testing: same program + same seed must produce the same
 * result (or the same error message) in naive and nova — for everything
 * outside the deliberate-divergence list in nova/docs/compat.md.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type * as I from "@dicexp/interface";
// `/internal` entries resolve to TS sources (the packages' main entries
// point at unbuilt dist/).
import { Evaluator } from "@dicexp/naive-evaluator/internal";
import { builtinScope } from "@dicexp/naive-evaluator-builtins/internal";

import { createEvaluatorSync, NovaAssets } from "../lib";

const wasmDir = path.join(__dirname, "..", "wasm");

function loadAssets(): NovaAssets | null {
  try {
    return {
      compiler: fs.readFileSync(path.join(wasmDir, "nova-compiler.wasm")),
      builtins: fs.readFileSync(path.join(wasmDir, "nova-builtins.wasm")),
      shim: fs.readFileSync(path.join(wasmDir, "nova-shim.wasm")),
    };
  } catch {
    return null;
  }
}

const assets = loadAssets();
if (!assets) {
  throw new Error(
    "nova wasm assets not found; run `just build-nova-wasm` first",
  );
}

/** Programs naive evaluates "correctly" — nova must agree (value or error). */
const PROGRAMS: string[] = [
  // literals & arithmetic
  "1 + 2 * 3 - 4",
  "2 ** 10 % 100",
  "7 // 2 + 7 % 2",
  "-(3 + 4) * +(5)",
  "1 < 2 == true",
  "1 + 1 == 2 and 2 * 2 == 4", // and/or WITHOUT erroring RHS (no divergence)
  "not (1 > 2)",
  "9007199254740991 - 1",
  // lists & functions
  "[1, 2, 3] |> sum",
  "sort([5, 3, 1, 4]) |> head",
  "zip([1, 2], [3, 4]) |> at(1) |> at(0)",
  "map([1, 2, 3], |$x| $x ** 2) |> sum",
  "filter(1~10, |$x| $x % 2 == 0)",
  "zipWith([1, 2, 3], [4, 5, 6], |$a, $b| $a * $b)",
  "count(3#d6, |$x| $x > 3)",
  "any?(map(2#d6, |$x| $x == 6))",
  "append(sort([2, 1]), 0) |> tail",
  // closures, captures, scoping
  "(|$x| (|$y| $x * 10 + $y).(2)).(1)",
  "10 |> (|$x| $x * 2).() |> &-/2.(100)",
  "(&**/2).(3, 3)",
  "map([1, 2], (|$base| |$x| $x + $base).(100))",
  // dice & repetition (seeded → must match exactly)
  "3d6",
  "d100",
  "10#d10",
  "3#(2d6 + 1)",
  "sort(10#d100) |> at(5)",
  "sum(100#d6)",
  "d1_000_000",
  "2 * d6 + d4",
  // reroll/explode (sequence transformers — landed v0.4 in both impls)
  "10d6 |> reroll(|$x| $x <= 5)", // only 6s survive → sum 60 on ANY seed
  "3#d6 |> reroll(|$x| $x <= 3)", // list-valued; rerolled slots draw again
  "3d6 |> explode(|$x| $x == 6)", // $sum source → summed integer
  "3#d6 |> explode(|$x| $x == 6)", // list; explosion extras AFTER base rolls
  "1d2 |> explode(|$x| $x == 2)", // re-explosion chains (short per seed)
  "10d6 |> reroll(|$x| $x <= 5) |> reroll(|$x| $x == 6 and d2 == 1)",
  // `~` is a uniform die draw (not a static range), so a range arm keeps
  // drawing past its nominal end — matching dice arms, a reroll never
  // depletes it. The 1~2 row depletes on reroll: with `$x == 2` rerolled
  // and nothing left to pull, the owed rerolls vanish and re-casting
  // yields [] (both impls).
  "(1~6) |> reroll(|$x| $x <= 2)",
  "(1~2) |> reroll(|$x| $x == 2)",
  "(1~2) |> reroll(|$x| false)", // always-false reroll: pass-through
  // transformers consumed by already-cast list consumers
  "(3#d6 |> explode(|$x| $x == 6)) |> sum",
  "(3#d6 |> explode(|$x| $x == 6)) |> sort",
  // errors through the LIST path (structured, no crash; exact message
  // equality — note explode's closure-return-type error is reported as if
  // from reroll/2: the replicated quirk in compat.md)
  "(3#d6 |> explode(|$x| $x + 1)) |> at(0)",
  "(3#d6 |> reroll(|$x| $x + 1)) |> at(0)",
  "(3#d6 |> explode(|$x| 1 // 0 == 0)) |> at(0)", // closure errors itself
  // laziness edge: the always-false predicate never forces its argument,
  // yet the errored elements still surface (at cast time) on both sides.
  "(2#(1 // 0) |> reroll(|$x| false))",
  // Ended semantics: the explode stream terminated on a closure error
  // (its error item IS pulled once, and the predicate — which ignores its
  // argument — rerolls it); the source is then never pulled again, so the
  // reroll yields the EMPTY LIST (both impls).
  "3#d6 |> explode(|$x| 5) |> reroll(|$x| true)",
  // NOTE: `100#any?(3#(d100 <= 5))` moved to the deliberate-divergence
  // section below (any? short-circuits in nova — compat.md #1).
  // runtime errors (same message expected)
  "1 // 0",
  "5 % 0",
  "(-2) % 3",
  "2 ** -3",
  "1 == true",
  "[1] |> at(3)",
  "head([])",
  "sum([true])",
  "1 + true",
  "true + 1",
  "[1] + 1",
  "not 1",
  "(|$x, $y| $x).(1)",
  "1.(2)",
  "(|$x| $x)",
  "9007199254740991 + 1",
  "true#1",
  // reroll/explode argument type errors (message parity; the empty list
  // is not a sequence — an arg-1 mismatch, not a runtime success)
  "reroll(1, |$x| true)",
  "reroll(d6, 1)",
  "explode([], |$x| true)",
  // compat.md #4 was about naive being undefined-as-spec on empty lists;
  // empirically naive seeded-reduces just like nova, so these are plain
  // parity rows (kept as sentinels against a future divergence).
  "sum([])",
  "product([])",
  // Non-forcing `count` over erroring elements: ok on BOTH impls for
  // plain lists and `#` sequences (boundary sentinels for the map/zipWith
  // error-beacon divergence below — compat.md #9).
  "count([1 // 0, 2, 3], |$e| true)",
  "count(2#(1 // 0), |$e| true)",
];

const SEEDS = [0, 1, 42];

const naive: I.Evaluator = new Evaluator({
  topLevelScope: builtinScope,
  randomSourceMaker: "xorshift7",
});
const nova: I.Evaluator = createEvaluatorSync(assets);

function runBoth(code: string, seed: number) {
  const opts: I.EvaluationOptions = { execution: { seed } };
  return [naive.evaluate(code, opts), nova.evaluate(code, opts)] as const;
}

describe(
  "differential: naive vs nova",
  () => {
    for (const code of PROGRAMS) {
      describe(`\`${code}\``, () => {
        for (const seed of SEEDS) {
          it(`seed ${seed}`, () => {
            const [expected, actual] = runBoth(code, seed);
            expect(
              summarize(actual),
              `naive: ${JSON.stringify(summarize(expected))} / ` +
                `nova: ${JSON.stringify(summarize(actual))}`,
            ).toEqual(summarize(expected));
          });
        }
      });
    }
  },
);

/** Reduce an EvaluationResult to its comparable essence. */
function summarize(result: I.EvaluationResult): unknown {
  if (result[0] === "ok") return ["ok", result[1]];
  if (result[0] === "error" && result[1] === "runtime") {
    return ["error", "runtime", result[2].message];
  }
  if (result[0] === "error" && result[1] === "parse") {
    return ["error", "parse", result[2].message];
  }
  return [result[0], result[1], String(result[2])];
}

/**
 * Deliberate evaluation divergences (compat.md #1 — `any?` short-circuits
 * element forcing in nova; naive forced every element):
 *
 * - error precedence: nova never forces elements past the first `true`,
 *   so erroring/non-boolean trailing elements go unnoticed;
 * - RNG consumption: skipping the remaining elements skips their dice
 *   draws, shifting every subsequent roll (a single `any?` result itself
 *   still agrees — the boolean is the same; only the stream position
 *   differs).
 *
 * Both sides are pinned exactly per seed. If a pinned pair ever becomes
 * equal, the divergence is gone and the row should move back to PROGRAMS.
 */
describe(
  "differential: deliberate divergences",
  () => {
    /** Seed-independent rows: [code, naive, nova]. */
    const DIVERGENT_STABLE: [code: string, naive: unknown, nova: unknown][] =
      [
        [
          "any?([true, 1 // 0 > 0])",
          ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
          ["ok", true],
        ],
        [
          "any?([true, 5])",
          ["error", "runtime", "传入的列表存在非「布尔」项"],
          ["ok", true],
        ],
      ];

    /** RNG-shift rows: [code, [seed, naive, nova][]]. */
    const DIVERGENT_RNG: [
      code: string,
      perSeed: [seed: number, naive: unknown, nova: unknown][],
    ][] = [
      [
        // The `any?` result itself agrees on every seed; the following
        // `d100` diverges exactly when the short-circuit skipped draws
        // (seed 1: first die already satisfies the predicate — naive still
        // forced all three). Seeds 0/42 have all-false groups → no skip →
        // full agreement.
        "[any?(3#(d100 <= 5)), d100]",
        [
          [0, ["ok", [false, 81]], ["ok", [false, 81]]],
          [1, ["ok", [true, 90]], ["ok", [true, 84]]],
          [42, ["ok", [false, 47]], ["ok", [false, 47]]],
        ],
      ],
    ];

    for (const [code, naiveExpected, novaExpected] of DIVERGENT_STABLE) {
      it(`\`${code}\` diverges as documented (compat.md #1)`, () => {
        const [n, v] = runBoth(code, 0);
        expect(summarize(n), "naive").toEqual(naiveExpected);
        expect(summarize(v), "nova").toEqual(novaExpected);
      });
    }

    for (const [code, perSeed] of DIVERGENT_RNG) {
      describe(`\`${code}\` (compat.md #1)`, () => {
        for (const [seed, naiveExpected, novaExpected] of perSeed) {
          it(`seed ${seed}`, () => {
            const [n, v] = runBoth(code, seed);
            expect(summarize(n), "naive").toEqual(naiveExpected);
            expect(summarize(v), "nova").toEqual(novaExpected);
          });
        }
      });
    }
  },
);

/**
 * Deliberate divergence (compat.md #9, last bullet — reroll/explode
 * bad-closure over a sequence$sum source that gets summed): naive *crashes*
 * with an uncaught `ReferenceError` (the sum cast feeds the error box into
 * `badFinalResult`, whose localization hits an undeclared variable in
 * `internal/l10n/lib.ts`) — it never produces a structured result. nova
 * reports the underlying error cleanly, still named `reroll/2` for BOTH
 * builtins (the replicated explode-named-reroll quirk).
 *
 * Shape differs from DIVERGENT_STABLE: naive's side is pinned by asserting
 * `naive.evaluate(…)` THROWS; nova's summary is pinned exactly. If naive
 * ever stops throwing, the carve-out is gone and the rows should move to
 * PROGRAMS.
 */
describe(
  "differential: deliberate divergences (naive crashes — compat.md #9)",
  () => {
    const CLOSURE_RETURN_TYPE_MISMATCH =
      "作为第 2 个参数传入通常函数 reroll/2 的返回值类型与期待不符：" +
      "期待「布尔」，实际「整数」。";

    /** [code, nova summary] — naive must throw on every seed. */
    const DIVERGENT_NAIVE_CRASHES: [code: string, nova: unknown][] = [
      [
        "10d6 |> reroll(|$x| $x + 1)",
        ["error", "runtime", CLOSURE_RETURN_TYPE_MISMATCH],
      ],
      [
        "10d6 |> explode(|$x| $x + 1)",
        ["error", "runtime", CLOSURE_RETURN_TYPE_MISMATCH],
      ],
      [
        "(10d6 |> reroll(|$x| $x + 1)) |> sum",
        ["error", "runtime", CLOSURE_RETURN_TYPE_MISMATCH],
      ],
      [
        "(10d6 |> explode(|$x| $x + 1)) |> sum",
        ["error", "runtime", CLOSURE_RETURN_TYPE_MISMATCH],
      ],
    ];

    for (const [code, novaExpected] of DIVERGENT_NAIVE_CRASHES) {
      describe(`\`${code}\` (compat.md #9)`, () => {
        for (const seed of SEEDS) {
          it(`seed ${seed}: naive throws, nova reports the error cleanly`, () => {
            const opts: I.EvaluationOptions = { execution: { seed } };
            expect(() => naive.evaluate(code, opts)).toThrow(ReferenceError);
            // Pin the crash's message too (the localization bug).
            expect(() => naive.evaluate(code, opts)).toThrow(
              "name is not defined",
            );
            const v = nova.evaluate(code, opts);
            expect(summarize(v), "nova").toEqual(novaExpected);
          });
        }
      });
    }
  },
);

/**
 * Deliberate divergence (compat.md #9 — the map/zipWith error beacon):
 * `map`/`zipWith`'s internal break-check materializes each element's error
 * state into naive's list error beacon, so a later consumer that NEVER
 * forces the elements still errors in naive. naive is internally
 * inconsistent: the same non-forcing `count` over a plain list or a `#`
 * sequence of erroring elements returns ok in naive too (those agreeing
 * shapes are pinned in PROGRAMS above). nova's uniform laziness matches
 * naive's own plain-list behavior. Found by the v0.5 fuzzer.
 */
describe(
  "differential: deliberate divergences (map/zipWith error beacon — compat.md #9)",
  () => {
    const DIVERGENT_BEACON: [code: string, naive: unknown, nova: unknown][] =
      [
        [
          "count(map([0], |$d| 1 // 0), |$e| true)",
          ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
          ["ok", 1],
        ],
        [
          "count(zipWith([0], [0], |$a, $b| 1 // 0), |$e| true)",
          ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
          ["ok", 1],
        ],
        [
          // Both error, but with different messages: naive reports the
          // poisoned beacon; nova's inner count returned 1, so its outer
          // count sees an integer argument.
          "count(count(map([0], |$d| 1 // 0), |$e| true), |$e| true)",
          ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
          [
            "error",
            "runtime",
            "调用的第 1 个参数类型不匹配：期待类型「列表」与实际类型「整数」不符",
          ],
        ],
      ];

    for (const [code, naiveExpected, novaExpected] of DIVERGENT_BEACON) {
      it(`\`${code}\` diverges as documented (compat.md #9)`, () => {
        const [n, v] = runBoth(code, 0);
        expect(summarize(n), "naive").toEqual(naiveExpected);
        expect(summarize(v), "nova").toEqual(novaExpected);
      });
    }
  },
);

/** The parse-error message; fails the test for any other outcome. */
function parseErrorMessage(result: I.EvaluationResult): string {
  expect(result[0], JSON.stringify(result)).toBe("error");
  if (result[0] !== "error") throw new Error("unreachable");
  expect(result[1]).toBe("parse");
  if (result[1] !== "parse") throw new Error("unreachable");
  return result[2].message;
}

/**
 * Parse-error spans and their rendering (compat.md #10).
 *
 * naive renders Lezer `⚠` ranges as raw 0-based from/to columns with the
 * excerpt starting one char before the span (`parse_error.ts`
 * `generalGrammar`); at end-of-input its `⚠` is the empty range at the
 * input end, so the excerpt shows the last character (trailing whitespace
 * included). nova's locale uses the same convention on its own spans, so
 * the messages match exactly wherever the underlying failure is the same.
 */
describe(
  "differential: parse errors",
  () => {
    /** Same failure: the full message must match naive's exactly. */
    const PARITY: string[] = [
      // truncated at EOF — the ⚠ is the empty range at the input end and
      // the excerpt shows the last character
      "1+", "d", "3#", "map(", "d(", "|$x|", "1~", "&", "2 |>", "1 **",
      "1 //", "3 d ", "1 .", "|$x| $x +", "1 d", "[1, 2", "not", "-", "+",
      "~", "1 + 2 +", "1+  ", "   ", "", "&sum/", "&d/", "d100 # ", "1~2~",
      "head([1]) |> ", "1 # ", "true and", "1 and", "1 or",
      // full-width source — excerpts show the half-width-normalized text
      "１＋", "１＋１＋",
      // mid-input junk: nova's offending-token span coincides with naive's ⚠
      "1+2)", "1 1", "true true", "1?", ")", "1 ;", "&/",
    ];

    /**
     * Same failure, but naive reports every `⚠` range while nova reports
     * one parse error at a time (compat.md #10): nova's message must equal
     * naive's message up through the first `⚠` range.
     */
    const ONE_AT_A_TIME: string[] = [
      "[1,", "(", "(((", "(|", "(|$x", "(|$x,", "(|$x|", "foo(1,", "sum([1,",
    ];

    /**
     * Deliberate divergences (compat.md #10): nova's span is the offending
     * token; naive's Lezer recovery places its `⚠`s elsewhere (empty ⚠ at
     * the operand-expectation position, or an empty ⚠ with no excerpt).
     * Both sides are pinned: if they ever coincide, the carve-out should
     * be removed.
     */
    const DIVERGENT: [code: string, novaMsg: string, naiveMsg: string][] = [
      [
        "d-",
        "以下位置的语法有误：\n\t自列 1 至列 2：d-",
        "以下位置的语法有误：\n\t自列 1 至列 1：d\n\t自列 2 至列 2：-",
      ],
      [
        "d+",
        "以下位置的语法有误：\n\t自列 1 至列 2：d+",
        "以下位置的语法有误：\n\t自列 1 至列 1：d\n\t自列 2 至列 2：+",
      ],
      [
        "]",
        "以下位置的语法有误：\n\t自列 0 至列 1：]",
        "以下位置的语法有误：\n\t自列 0 至列 0：",
      ],
      [
        "((1+)",
        "以下位置的语法有误：\n\t自列 4 至列 5：+)",
        "以下位置的语法有误：\n\t自列 4 至列 4：+\n\t自列 5 至列 5：)\n\t自列 5 至列 5：)",
      ],
    ];

    it("reproduces naive's exact message", () => {
      for (const code of PARITY) {
        const [n, v] = runBoth(code, 0);
        expect(parseErrorMessage(v), JSON.stringify(code)).toBe(
          parseErrorMessage(n),
        );
      }
    });

    it("reports one error at a time: its message is naive's first ⚠ range", () => {
      for (const code of ONE_AT_A_TIME) {
        const [n, v] = runBoth(code, 0);
        const naiveMsg = parseErrorMessage(n);
        const novaMsg = parseErrorMessage(v);
        expect(naiveMsg.startsWith(novaMsg + "\n\t"), JSON.stringify(code))
          .toBe(true);
      }
    });

    it("pins the deliberate span divergences (compat.md #10)", () => {
      for (const [code, novaMsg, naiveMsg] of DIVERGENT) {
        const [n, v] = runBoth(code, 0);
        expect(parseErrorMessage(v), `nova ${JSON.stringify(code)}`).toBe(
          novaMsg,
        );
        expect(parseErrorMessage(n), `naive ${JSON.stringify(code)}`).toBe(
          naiveMsg,
        );
      }
    });
  },
);
