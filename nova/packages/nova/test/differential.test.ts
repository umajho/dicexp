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
  // v0.7 builtins (nova/docs/v0.7-contracts.md) — agreement shapes on every
  // seed (values AND exact error messages). The `all?/1` div1-sensitive
  // shapes live in the deliberate-divergence blocks below.
  // scalar / utility
  "abs(-3)",
  "abs(-9007199254740991)",
  "count([1 // 0, 2])", // length without forcing elements
  "count(3#d6)", // sequence auto-cast to a list, elements unforced
  "has?([1, 2, 3], 2)",
  "has?([1, 2, 3], 4)",
  "has?([true, false], true)",
  "has?([true], 1)", // scalar cross-type: simply unequal, no error
  "has?([1, 2], true)",
  "has?([1, 1 // 0], 1)", // first match short-circuits the errored tail
  "has?([[1]], 1)", // non-scalar element → LIST_HAS_NON_SCALAR_ITEM
  "has?([d1], 1)", // sequence$sum element casts to its sum
  // short-circuit consumes exactly one draw, so the trailing d100 is the
  // stream's second draw on BOTH sides (an agreement row — both impls
  // short-circuit; unlike the all?/any? div1 rows below)
  "[has?([1, d6], 1), d6]",
  "min([3, 1, 2])",
  "max([3, -1, 2])",
  "min([5])",
  "max([5])",
  "min(3#d1)", // implicit cast of a sequence$sum argument
  "max(3#d1)",
  "min([])", // 列表为空
  "max([])",
  "min([true])", // LIST_HAS_NON_NUMBER_ITEM
  "max([1, true])",
  "all?([])",
  "all?([true, true])",
  "all?([true, false])",
  // nested lists flatten correctly on both sides (naive's flattenListAll
  // indexing bug was fixed in naive in v0.7 — compat.md #9 bullet 1 retired)
  "all?([[true], [false, true]])",
  "all?([1])", // non-boolean FIRST element: no skip on either side
  "any?([[false, true], false])", // ditto for any? — agreement since the fix
  // ordering / reshaping
  "sort([3, 1, 2], |$a, $b| $a <= $b)",
  "sort([3, 1, 2], |$a, $b| $a >= $b)",
  "sort([true, false], |$a, $b| $a <= $b)",
  // stability: equal comparison keys keep their relative order
  "sort([[1, 2], [1, 1]], |$a, $b| at($a, 0) <= at($b, 0))",
  "sort([[1, 1], [1, 2], [0, 3]], |$a, $b| at($a, 0) <= at($b, 0))",
  "sort([2, 1], |$a, $b| $a + $b)", // non-boolean comparator → exact error
  "sort([2, 1], |$a, $b| 1 // 0)", // comparator error aborts the sort
  "count(sort([1 // 0, 2], |$a, $b| true))", // elements passed unforced
  "reverse([1, 2, 3])",
  "head(reverse([1 // 0, 2]))", // handles reversed, elements unforced
  "concat([1], [2, 3])",
  "concat([], [])",
  "prepend([2, 3], 1)",
  "prepend([1], [true])",
  "at(prepend([1], 1 // 0), 1)", // prepended element stays unforced
  "at([10, 20], 5, 7)", // OOB → default, never an error
  "at([10, 20], -1, 7)",
  "at([], 0, 7)",
  "at([1], 0, 1 // 0)", // in-bounds: the default is never forced
  "at([1], 5, 1 // 0)", // OOB: the default is forced → error
  "at([1], 5, d6)", // the default draw aligns with the shared stream
  "duplicate(7, 3)",
  "duplicate(1, 0)",
  "duplicate(1, -2)",
  // pinned value semantics: the SAME handle repeated → ONE draw, so the sum
  // is 3× the first roll for the seed (vs `#` below, which re-evaluates)
  "duplicate(d6, 3) |> sum",
  "3#d6 |> sum", // the contrast row — generally a different sum per seed
  "count(duplicate(1 // 0, 2))", // the same handle twice, unforced
  "duplicate(1 // 0, 2)", // casting the list forces the shared handle → error
  "flatten([1, [2, [3]]], 1)",
  "flatten([1, [2, [3]]], 0)", // depth ≤ 0: shallow copy
  "flatten([1, [2], [[3]]], 5)",
  "flatten([1, [2], [[3]]], -1)",
  "count(flatten([[1 // 0]], 1))", // elements AT the boundary stay unforced
  "flatten([[1 // 0]], 2)", // above the boundary: forced, error propagates
  // implicit-cast rule at the depth boundary's test: a sequence$sum element
  // casts to its sum (a leaf); a `#` repetition casts to its list (splices)
  "flatten([d1], 1)",
  "flatten([2d1], 1)",
  "flatten([3#d1], 1)",
  "flattenAll([1, [2, [3, [[4]]]]])",
  "flattenAll([[1 // 0]])", // every element is eventually forced
  // folds / unfolds
  "flatMap([1, 2], |$x| [$x, $x])",
  "flatMap([1], |$x| [[], [$x]])", // only one level is flattened
  "flatMap([1], |$x| drop(3d1, 1))", // plain-sequence result casts to a list
  "count(flatMap([1], |$x| [1 // 0, $x]))", // inner elements appended unforced
  "flatMap([1], |$x| $x)", // non-list result → exact error
  "flatMap([1], |$x| d6)", // sequence$sum casts to an integer — still wrong
  "flatMap([1, 2], |$x| 1 // 0)", // closure error aborts the whole call
  "foldl([1, 2, 3], 0, |$acc, $e| $acc + $e)",
  "foldl([1, 2], 10, |$acc, $e| $acc - $e)",
  "count([foldl([], 1 // 0, |$acc, $e| 0)])", // empty: init stays unforced
  "foldl([1, 1 // 0, 3], 0, |$acc, $e| $acc + $e)", // error stops the fold
  "foldr([1, 2, 3], 0, |$e, $acc| $e + $acc)",
  "foldr([1, 2], 0, |$e, $acc| $e - $acc)", // right-to-left: 1 - (2 - 0)
  "foldr([1, 2], 1 // 0, |$e, $acc| $e)", // the acc is never forced by foldr
  // Dice in foldr elements/init: bodies execute outer-in in BOTH impls
  // (pinned in v0.7-contracts.md; naive's foldr lazy-wraps its deferred
  // calls after WS3b's fuzzer found its `_call` eager-body quirk shifting
  // the draw order). These agreed post-fix on seeds 0/1/42.
  "foldr([d2, d100], d1000, |$e, $acc| $e - $acc)",
  "foldr([d6, d20, d100], d1000, |$e, $acc| $e * 2 + $acc)",
  "foldl([d2, d100], d1000, |$acc, $e| $e * 100000 + $acc)",
  "iterate(1, |$x| $x + 1) |> take(5)",
  "iterate(1, |$x| $x + 1) |> take(0)", // no pull → no error, no draw
  "sum(iterate(1, |$x| $x + 1) |> take(3))",
  "iterate(1, |$x| $x + 1) |> drop(2) |> take(2)",
  "unfold(3, |$n| [$n, $n - 1]) |> take(3)",
  // `false` ends the stream (simulated if, no trailing `.()` — plain values
  // are not callable)
  "unfold(3, |$x| head(append(filter([[$x, $x - 1]], |_| $x > 0), false))) |> take(5)",
  "unfold([0, 1], |$p| [at($p, 0), [at($p, 1), at($p, 0) + at($p, 1)]]) |> take(5)",
  "count(unfold(1, |$x| [1 // 0, false]) |> take(1))", // item stays unforced
  "unfold(1 // 0, |$x| false) |> take(0)", // no pull: the seed is never forced
  "unfold(1 // 0, |$x| false) |> take(1)", // the seed is forced at pull 0
  "unfold(1, |$x| 42) |> take(3)", // step type mismatch (整数)
  "unfold(1, |$x| true) |> take(1)", // step type mismatch (布尔)
  "unfold(1, |$x| [1, 2, 3]) |> take(3)", // step list length (3 个)
  "unfold(1, |$x| []) |> take(1)", // step list length (0 个)
  "unfold(1, |$x| 1 // 0) |> take(1)", // closure error → terminal error item
  "iterate(1, |$x| 1 // 0) |> take(2)",
  // drop silently discards the skipped terminal-error item
  "unfold(1, |$x| 42) |> drop(1) |> take(1)",
  // last / init
  "last([1, 2, 3])",
  "last([5])",
  "init([1, 2, 3])",
  "init([5])",
  "last([1 // 0, 2])", // elements unforced
  "last(init([1, 1 // 0]))",
  "last([])", // 列表为空
  "init([])",
  // take / drop (lists AND sequences)
  "take([1, 2, 3], 2)",
  "take([1], 5)",
  "take([], 2)",
  "take([1, 2], 0)",
  "drop([1, 2, 3], 1)",
  "drop([1, 2, 3], 5)",
  "drop([], 3)",
  "drop([1, 2], -1)",
  "take(d1, 3)", // sequences pull past the nominal end
  "take(3d1, 2)",
  "take(3#d1, 2)",
  "drop(3d1, 1)", // $sum-ness dropped → plain list on the cast
  "drop(d1, 0) |> take(2)",
  "take(drop(5#d1, 2), 2)",
  "take(drop(3d1, 1), 2)",
  "take(3#d6, 0)", // n ≤ 0: pulls nothing
  "take(d6, -1)",
  "count([drop(d6, 1)])", // constructing the drop pulls nothing
  // takeWhile / dropWhile
  "takeWhile([], |$x| true)",
  "takeWhile([1, 2, 3], |$x| $x < 3)",
  "takeWhile([1, 2, 3], |$x| true)",
  "takeWhile([2, 1], |$x| $x < 2)",
  "takeWhile([1, 3, 1 // 0], |$x| $x < 2)", // stop: the errored tail is safe
  "takeWhile([0, 1 // 0], |$x| $x > 0)",
  "takeWhile([1], |$x| $x)", // non-boolean predicate → exact error
  "takeWhile([1, 2], |$x| 1 // 0)", // predicate error → whole call errors
  "dropWhile([], |$x| true)",
  "dropWhile([1, 2, 3], |$x| $x < 3)",
  "dropWhile([1, 2, 3], |$x| true)",
  "dropWhile([1, 2, 3], |$x| false)",
  "count(dropWhile([1, 3, 1 // 0], |$x| $x < 2))", // rest untouched by f
  "dropWhile([1], |$x| $x)",
  "dropWhile([1], |$x| 1 // 0)",
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
 * element forcing in nova; naive forced every element; v0.7's `all?/1`
 * mirrors the split with nova stopping at the first `false` while naive's
 * fresh `all?/1` flattens eagerly):
 *
 * - error precedence: nova never forces elements past the first `true`
 *   (`any?`) / `false` (`all?`), so erroring/non-boolean trailing elements
 *   go unnoticed;
 * - RNG consumption: skipping the remaining elements skips their dice
 *   draws, shifting every subsequent roll (a single `any?`/`all?` result
 *   itself still agrees — the boolean is the same; only the stream position
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
        // v0.7: `all?/1` mirrors the `any?/1` split — nova short-circuits at
        // the first `false`; naive flattens eagerly (compat.md #1).
        [
          "all?([false, 1 // 0 > 0])",
          ["error", "runtime", "操作 “1 // 0” 非法：除数不能为零"],
          ["ok", false],
        ],
        [
          "all?([false, 5])",
          ["error", "runtime", "传入的列表存在非「布尔」项"],
          ["ok", false],
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
      [
        // v0.7 `all?` twin of the row above (compat.md #1): nova stops
        // forcing at the first `false` (first d100 ≤ 5, i.e. first failed
        // `> 5`); naive draws all three. Mechanic verified per seed against
        // the shared dice stream before pinning (draws for seeds 0/1/42 =
        // [72,57,57,81] / [73,2,84,90] / [40,12,72,47]): the `all?` boolean
        // is the AND of the first three draws on BOTH sides, and the
        // trailing `d100` is draw #4 for naive but draw #(k+1) for nova
        // when k = the first false index. Seeds 0/42 have no early false →
        // no skip → full agreement; seed 1 skips one draw.
        "[all?(3#(d100 > 5)), d100]",
        [
          [0, ["ok", [true, 81]], ["ok", [true, 81]]],
          [1, ["ok", [false, 90]], ["ok", [false, 84]]],
          [42, ["ok", [true, 47]], ["ok", [true, 47]]],
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
