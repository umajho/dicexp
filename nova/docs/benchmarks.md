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

## Method (CI-style suite, v0.6 — supersedes the playground numbers for
optimization decisions)

- Suite: `nova/packages/nova/bench/` (`pnpm run bench`; knobs `BENCH_SCALE`,
  `BENCH_ONLY`, `NOVA_COMPILER_WASM_PATH` / `NOVA_BUILTINS_WASM_PATH` for
  compiler/builtins swaps). 12 workloads: the 11 playground presets plus one
  const-pool visibility workload (`100#([1,2,3,4,5] |> sum) |> sum`).
- Per workload: identical untimed warmup on both implementations, then a
  timed window of N pulls through `makeEvaluationGenerator` (same seed range
  on both sides), naive first, sequential. Unlike the playground method, the
  one-time parse/compile is OUTSIDE the timed window (steady-state rates);
  one-shot costs are measured separately (`overhead.test.ts`).
- Every row asserts **exact value agreement** over the timed window — the
  suite doubles as a differential checker, like the playground mode.
- Results (JSON + markdown) land in the gitignored `bench/results/`.

## 2026-10-06 — v0.6 performance & size

Machine: an Apple M-series machine (darwin/arm64), Node v24.7.0,
`BENCH_SCALE=1`. Run-to-run variance on these numbers is roughly ±5%
(±10% on the const-pool workload); the tables below are single runs.

### Baseline (v0.5 state: per-sample program instantiation, no wasm-opt)

| label | samples | naive ms | naive samples/s | nova ms | nova samples/s | nova/naive |
|---|---:|---:|---:|---:|---:|---:|
| d6（基线） | 1000000 | 1831.9 | 545.9k/s | 4957.5 | 201.7k/s | 0.37× |
| sum([1, 2, 3]) | 300000 | 893.0 | 335.9k/s | 1478.5 | 202.9k/s | 0.60× |
| 闭包调用 (ǀ$a, $bǀ $a + $b).(1, 2) | 200000 | 546.4 | 366.0k/s | 1083.9 | 184.5k/s | 0.50× |
| d10 ~ 3d8+10 | 100000 | 510.9 | 195.7k/s | 636.0 | 157.2k/s | 0.80× |
| 模拟 if-else（filter/append/head） | 100000 | 530.0 | 188.7k/s | 637.0 | 157.0k/s | 0.83× |
| 100#any?(map(3#d100, …)) 计假数 | 3000 | 3803.4 | 788.8/s | 779.9 | 3.8k/s | 4.88× |
| 重掷：100#(10d6 ǀ> reroll(≤2)) 求和 | 10000 | 20555.9 | 486.5/s | 5825.2 | 1.7k/s | 3.53× |
| 爆炸：100#(3d6 ǀ> explode(=6)) 求和 | 20000 | 13654.2 | 1.5k/s | 3917.6 | 5.1k/s | 3.49× |
| 大排序：1000#d100 ǀ> sort ǀ> sum | 2000 | 2800.8 | 714.1/s | 847.3 | 2.4k/s | 3.31× |
| 自递归构造列表 0..<99 再求和 | 1000 | 3154.6 | 317.0/s | 216.5 | 4.6k/s | 14.57× |
| Y 组合子求和 0..10 | 5000 | 1156.0 | 4.3k/s | 145.7 | 34.3k/s | 7.93× |

### Final (program-instance reuse + wasm-opt + const-pool hoisting)

| label | samples | naive ms | naive samples/s | nova ms | nova samples/s | nova/naive |
|---|---:|---:|---:|---:|---:|---:|
| d6（基线） | 1000000 | 1804.8 | 554.1k/s | 2688.6 | 371.9k/s | 0.67× |
| sum([1, 2, 3]) | 300000 | 852.0 | 352.1k/s | 774.1 | 387.5k/s | 1.10× |
| 闭包调用 (ǀ$a, $bǀ $a + $b).(1, 2) | 200000 | 537.7 | 371.9k/s | 541.2 | 369.6k/s | 0.99× |
| d10 ~ 3d8+10 | 100000 | 476.0 | 210.1k/s | 339.9 | 294.2k/s | 1.40× |
| 模拟 if-else（filter/append/head） | 100000 | 486.0 | 205.7k/s | 304.9 | 328.0k/s | 1.59× |
| 100#any?(map(3#d100, …)) 计假数 | 3000 | 3549.6 | 845.2/s | 679.8 | 4.4k/s | 5.22× |
| 重掷：100#(10d6 ǀ> reroll(≤2)) 求和 | 10000 | 20391.8 | 490.4/s | 4867.3 | 2.1k/s | 4.19× |
| 爆炸：100#(3d6 ǀ> explode(=6)) 求和 | 20000 | 13408.4 | 1.5k/s | 3336.5 | 6.0k/s | 4.02× |
| 大排序：1000#d100 ǀ> sort ǀ> sum | 2000 | 2800.8 | 714.1/s | 771.4 | 2.6k/s | 3.63× |
| 自递归构造列表 0..<99 再求和 | 1000 | 3134.7 | 319.0/s | 199.9 | 5.0k/s | 15.68× |
| Y 组合子求和 0..10 | 5000 | 1169.4 | 4.3k/s | 106.3 | 47.1k/s | 11.00× |
| 常量列表于循环体：100#([1,2,3,4,5] ǀ> sum) | 20000 | 4859.9 | 4.1k/s | 598.2 | 33.4k/s | 8.12× |

All 12 rows agreed exactly (incl. 1M `d6` seeds).

### What moved what (per-change attribution)

- **Program-instance reuse** (one `WebAssembly.Instance` per sampling
  session instead of per sample) is the trivial-program lever: `d6`
  0.37× → 0.67× (201.7k → 371.9k samples/s), `sum([1, 2, 3])` 0.60× → 1.10×,
  the closure call 0.50× → ~1.0×, and the naive-crossover moved below the
  `d10 ~ 3d8+10` / if-else rows (now 1.4–1.6×). nova now beats naive on
  everything except the two most trivial rows, which sit at 0.67–1.0×.
- **wasm-opt** (`-O3` builtins, `-Oz` compiler) added a small
  across-the-board improvement (in the deltas above).
- **Const-pool hoisting** is invisible on the 11 ported presets — none
  re-evaluates a literal list inside a loop body. Isolated by swapping the
  compiler (same harness, pre-const-pool vs current build): the dedicated
  workload went 548.4 → 497.1 ms for 20k samples (**+10.3% throughput**,
  ratio 8.11× → 8.87×); `sum([1, 2, 3])` −2.9%. The final table's own run
  shows larger variance on this workload (see header note).
- **The ≥10× target**: met on the two heaviest evaluation-bound programs
  (list-building recursion **15.7×**, Y-combinator **11.0×**). Mid-weight
  programs (reroll/explode/sort/any?) sit at 3.6–5.2×, the const-list
  workload at 8.1×.

### Small-expression one-shot overhead (compile + instantiate + run)

| code | calls | naive ms/call | nova ms/call | nova compile ms/call | nova run ms/call | compile+run ms/call |
|---|---:|---:|---:|---:|---:|---:|
| d6 | 2000 | 0.0076 | 0.0139 | 0.0055 | 0.0053 | 0.0108 |
| sum([1, 2, 3]) | 2000 | 0.0123 | 0.0149 | 0.0098 | 0.0069 | 0.0167 |

Per single-shot `evaluate` call, nova is ≈1.2–1.8× naive on trivial
expressions: compile (≈0.006–0.010 ms) and instantiate+run (≈0.005–0.007 ms)
each cost about half. This is the documented overhead for small expressions;
the sampling path amortizes all of it (compile once, instantiate once).

### Checkpoint-guard overhead (plan §3.9, measurement-only compiler swap)

Same suite, default vs `--no-default-features` compiler (no guard emission,
no `__checkpoint` import — measurement-only build, `just
build-nova-wasm-nockpt`), nova timed windows:

| workload | guard ON | guard OFF | delta |
|---|---:|---:|---:|
| Y 组合子求和 0..10 (5000 samples) | 112.6 ms | 108.4 ms | −3.7% |
| 自递归构造列表 0..<99 再求和 (1000) | 170.7 ms | 163.7 ms | −4.1% |
| 闭包调用 (ǀ$a, $bǀ $a + $b).(1, 2) (200000) | 552.1 ms | 549.9 ms | −0.4% (noise) |

The per-call guard costs ≈4% of evaluation time on call-dense recursive
programs and is unmeasurable on shallow ones. Material enough to record for
future budget discussions (e.g. if fuel/chunked-ops activation adds more
checkpoint work), nowhere near enough to reconsider the semantics — the
placement rule (plan §3.9) is unchanged.

### Sizes

See [`size-budget.md`](./size-budget.md): after wasm-opt, the compiler is
113,688 B raw / 35.3 KB brotli (adjusted budget ≤ 120 KB raw), builtins
36,746 B raw / 13.8 KB brotli (budget ≤ 50 KB — met), shim 82 B.

- v0.2 playground smoke test (2026-10, sampling `d6`, indefinite run):
  naive ≈390k samples/s, nova ≈235–240k samples/s. Per-sample program-instance
  creation dominates trivial programs; program compile is once per sampling
  session. That measurement is superseded by the table above.
