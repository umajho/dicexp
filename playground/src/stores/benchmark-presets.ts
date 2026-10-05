/**
 * Preset workloads for the benchmark panel (nova/docs/roadmap.md v0.3),
 * ported from `packages/naive-evaluator/test/executing/execute.bench.ts`.
 *
 * Constraints on every preset:
 * (a) evaluates to an INTEGER — the worker sampling channel only histograms
 *     integer results (booleans/lists abort sampling);
 * (b) stays on the naive/nova-compatible subset — no `reroll`/`explode`
 *     (stubbed in nova, nova/docs/compat.md TODO list);
 * (c) per-sample evaluation stays well under the worker heartbeat timeout
 *     (~5 s), because one sample evaluation blocks the worker's event loop.
 *
 * `defaultSampleCount` aims at roughly 1–5 s per implementation run; tune
 * from measured throughput (see nova/docs/benchmarks.md).
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
    label: "100#any?(3#(d100<=5))",
    code: String.raw`100#any?(3#(d100<=5)) |> count (|$x| not $x)`,
    defaultSampleCount: 10_000,
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
    defaultSampleCount: 2_000,
  },
  {
    // Y-combinator summing 0..10 (= 55), with the filter/append/head-based
    // if-else simulation (no `if/*` builtin). Evaluation-heavy: deep closure
    // and thunk churn per sample.
    label: "Y 组合子求和 0..10",
    code: String
      .raw`(|$if| (|$Y, $g| $Y.($g).(10)).((|$fn| (|$f| $fn.((|$x| $f.($f).($x)))).((|$f| $fn.((|$x| $f.($f).($x)))))), (|$f| (|$n| $if.($n == 0, (|| 0), (|| $n + $f.($n-1))))))).((|$cond, $t, $f| head(append(filter([$t], (|_| $cond)), $f)).()))`,
    defaultSampleCount: 500,
  },
];
