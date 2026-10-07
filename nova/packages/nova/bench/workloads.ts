/**
 * Preset workloads for the CI-style naive-vs-nova benchmark suite
 * (nova v0.6), copied verbatim from
 * `playground/src/stores/benchmark-presets.ts` (which ported them from
 * `packages/naive-evaluator/test/executing/execute.bench.ts`).
 *
 * Agreement constraints carried over from that file — every preset:
 * (a) evaluates to an INTEGER (the playground sampling channel only
 *     histograms integer results; kept so the suites stay comparable);
 * (b) naive/nova must agree seed-by-seed. That rules out raw `any?`/
 *     `all?` over `#`-lists (nova short-circuits element forcing,
 *     compat.md #1, shifting the RNG stream) — pre-force elements with
 *     `map` when `any?` is needed. `reroll`/`explode` agree exactly and
 *     may be used;
 * (c) keeps per-sample evaluation well under the worker heartbeat
 *     timeout (~5 s).
 *
 * `defaultSampleCount` targets roughly 1–5 s per implementation run at
 * `BENCH_SCALE=1` (see nova/docs/benchmarks.md); `BENCH_SCALE` in
 * `./support.ts` multiplies it.
 */
export interface BenchmarkPreset {
  label: string;
  code: string;
  defaultSampleCount: number;
}

export const benchmarkPresets: BenchmarkPreset[] = [
  {
    label: "d6（基线）",
    code: "d6",
    defaultSampleCount: 1_000_000,
  },
  {
    label: "sum([1, 2, 3])",
    code: "sum([1, 2, 3])",
    defaultSampleCount: 300_000,
  },
  {
    label: "闭包调用 (|$a, $b| $a + $b).(1, 2)",
    code: "(|$a, $b| $a + $b).(1, 2)",
    defaultSampleCount: 200_000,
  },
  {
    label: "d10 ~ 3d8+10",
    code: "d10 ~ 3d8+10",
    defaultSampleCount: 100_000,
  },
  {
    label: "模拟 if-else（filter/append/head）",
    code: "append(filter([10], (|_| false)), 100) |> head",
    defaultSampleCount: 100_000,
  },
  {
    // `map` pre-forces every die in BOTH implementations, so the `any?`
    // short-circuit (nova, compat.md #1) consumes no extra RNG and the
    // seed-by-seed results agree. (The previous form
    // `100#any?(3#(d100<=5))` diverged: nova's short-circuit skipped the
    // remaining draws of a group once a `true` appeared.)
    label: "100#any?(map(3#d100, …)) 计假数",
    code: String.raw`100#any?(map(3#d100, |$x| $x <= 5)) |> count (|$x| not $x)`,
    defaultSampleCount: 3_000,
  },
  {
    label: "重掷：100#(10d6 |> reroll(≤2)) 求和",
    code: String.raw`100#(10d6 |> reroll(|$x| $x <= 2)) |> sum`,
    defaultSampleCount: 10_000,
  },
  {
    label: "爆炸：100#(3d6 |> explode(=6)) 求和",
    code: String.raw`100#(3d6 |> explode(|$x| $x == 6)) |> sum`,
    defaultSampleCount: 20_000,
  },
  {
    label: "大排序：1000#d100 |> sort |> sum",
    code: "1000#d100 |> sort |> sum",
    defaultSampleCount: 2_000,
  },
  {
    // Builds the list 0..<100 via a self-recursive closure; `|> sum` makes
    // the final result an integer (4950). Parens keep `|> sum` outside the
    // original expression's own `|>` chain.
    label: "自递归构造列表 0..<99 再求和",
    code: String
      .raw`(|$f, $n, $l| (append(filter([(|| $l)], (|_| $n == 100)), (|| $f.($f, $n+1, append($l, $n)))) |> head |> (|$f| $f.()).()) |> (|$f| $f.($f, 0, [])).()) |> sum`,
    defaultSampleCount: 1_000,
  },
  {
    // Y-combinator summing 0..10 (= 55), with the filter/append/head-based
    // if-else simulation (no `if/*` builtin). Evaluation-heavy: deep closure
    // and thunk churn per sample.
    label: "Y 组合子求和 0..10",
    code: String
      .raw`(|$if| (|$Y, $g| $Y.($g).(10)).((|$fn| (|$f| $fn.((|$x| $f.($f).($x)))).((|$f| $fn.((|$x| $f.($f).($x)))))), (|$f| (|$n| $if.($n == 0, (|| 0), (|| $n + $f.($n-1))))))).((|$cond, $t, $f| head(append(filter([$t], (|_| $cond)), $f)).()))`,
    defaultSampleCount: 5_000,
  },
  {
    // v0.6 addition (NOT in the playground presets): const-pool visibility —
    // a pure-literal list inside a `#` body. nova hoists the list into a
    // program global allocated once per sample (plan §3.4); naive
    // re-allocates it per iteration. Deterministic, integer result
    // (100 × 15 = 1500), exact agreement.
    label: "常量列表于循环体：100#([1,2,3,4,5] |> sum)",
    code: String.raw`100#([1, 2, 3, 4, 5] |> sum) |> sum`,
    defaultSampleCount: 20_000,
  },
];
