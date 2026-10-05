# nova — Benchmarks

> Recorded performance comparisons between `naive` and `nova`. Sibling docs:
> [`roadmap.md`](./roadmap.md) (what the numbers feed into),
> [`plan.md`](./plan.md) (architecture), [`compat.md`](./compat.md)
> (divergences — the agreement checker is the differential oracle).

## Method (playground benchmark mode, v0.3)

- Each expression runs on **both** implementations through the regular worker
  sampling channels (`keepSampling`), **sequentially — naive first, then
  nova** — so the two workers never compete for CPU and the in-worker
  `Date.now` timing stays uncontended. (Sequential vs concurrent was an open
  nuance from v0.2; sequential chosen for exactly this reason.)
- The sampling channel stops automatically at exactly **N samples** (the
  `sampling.maxSamples` protocol extension), i.e. seeds 0..N−1 on both sides.
  Result agreement is **exact histogram equality** over those seeds — the
  mode doubles as an interactive differential checker.
- Elapsed time is measured **inside the worker** (sampling start → stop) and
  **includes the one-time parse/compile of each sampling session** (nova:
  source → program.wasm; naive: lezer parse). Per-sample program
  *instantiation* is included as well (instance reuse is a v0.6 item).
- Playground measurements are interactive-grade, not CI-grade: one run per
  configuration, browser machine, no warmup isolation. The v0.6 CI-style
  suite supersedes these numbers for optimization decisions.

## 2026-10-06 — first comparison (v0.3 exit criterion)

Machine: a desktop machine with an Apple M4-series CPU; Chromium-based
desktop browser (harness-driven). Presets are ported from
`packages/naive-evaluator/test/executing/execute.bench.ts`
(`playground/src/stores/benchmark-presets.ts`); all evaluate to integers and
stay on the naive/nova-compatible subset.

| preset | samples | naive 总耗时 | naive 吞吐 | nova 总耗时 | nova 吞吐 | nova/naive | 结果一致 |
|--------|---------|--------------|------------|-------------|-----------|------------|----------|
| `d6`（基线） | 1,000,000 | 2541 ms | 393.5k/s | 4861 ms | 205.7k/s | 0.52× | ✓ |
| `sum([1, 2, 3])` | 300,000 | 929 ms | 322.9k/s | 1526 ms | 196.6k/s | 0.61× | ✓ |
| 闭包调用 `(ǀ$a, $bǀ $a + $b).(1, 2)` | 200,000 | 586 ms | 341.3k/s | 885 ms | 226.0k/s | 0.66× | ✓ |
| `d10 ~ 3d8+10` | 100,000 | 413 ms | 242.1k/s | 456 ms | 219.3k/s | 0.91× | ✓ |
| 模拟 if-else（filter/append/head） | 100,000 | 450 ms | 222.2k/s | 465 ms | 215.1k/s | 0.97× | ✓ |
| `100#any?(3#(d100<=5)) ǀ> count (ǀ$xǀ not $x)` | 3,000 | 1357 ms | 2.2k/s | 395 ms | 7.6k/s | 3.44× | ✓ |
| 大排序 `1000#d100 ǀ> sort ǀ> sum` | 2,000 | 1671 ms | 1.2k/s | 447 ms | 4.5k/s | 3.74× | ✓ |
| 自递归构造列表 0..<99 再求和 | 1,000 | 2143 ms | 467/s | 168 ms | 6.0k/s | 12.76× | ✓ |
| Y 组合子求和 0..10 | 5,000 | 657 ms | 7.6k/s | 125 ms | 40.0k/s | 5.26× | ✓ |

(`ǀ` stands in for `|` in the table to not break the markdown; the real
programs use plain `|`.)

### Reading the numbers

- **Monotonic trend with evaluation weight.** Trivial programs put nova at
  0.52–0.66× naive: per-sample program-module *instantiation + linking*
  dominates nova's side (floor ≈ 4.9 µs/sample vs naive's ≈ 2.5 µs), while
  evaluation itself is near-instant. The crossover sits at a few
  dice/builtin calls per sample (`d10 ~ 3d8+10` at 0.91×, the if-else
  simulation at 0.97×). Genuinely evaluation-heavy programs run
  **3.4–12.8× faster** on nova.
- **Implication for v0.6 (roadmap §Risks): instance reuse is the first
  perf lever; static linking does NOT jump the queue.** nova wins by
  multiples on evaluation-heavy programs *despite* paying the
  cross-instance call overhead on every builtin call, so merging builtins
  into the program module is not urgent. Closing the trivial-program gap
  means reusing the program instance across samples (const-pool globals are
  re-initialized by `__main`'s prologue; verify table/heap assumptions —
  the v0.6 task).
- **Differential value: zero disagreements.** All 9 presets produced
  exactly identical result histograms on both implementations (up to 1M
  seeds for `d6`). The mode also surfaced a real shared bug on its first
  day: the sampling handler fell through after the generator's terminal
  error and reported the string `"runtime"` as an "unsupported result
  type" instead of the actual error (fixed in both worker packages;
  `reroll` under nova now correctly surfaces `功能 reroll/2 尚未实现`).
- **Caveat — small-N runs are compile-dominated.** A 20k-sample `d6` run
  showed 43.5k vs 29.2k samples/s (0.67×) because the one-time compile is
  inside the timing window; at the 1M default the steady rates are
  393.5k vs 205.7k. The preset defaults are sized to amortize this.

## Historical notes

- v0.2 playground smoke test (2026-10, sampling `d6`, indefinite run):
  naive ≈390k samples/s, nova ≈235–240k samples/s. Per-sample program-instance
  creation dominates trivial programs; program compile is once per sampling
  session. That measurement is superseded by the table above.
