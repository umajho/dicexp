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
  "100#any?(3#(d100 <= 5))",
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
