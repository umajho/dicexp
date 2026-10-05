/**
 * Benchmark panel (nova/docs/roadmap.md v0.3). Runs the expression in the
 * editor on BOTH implementations (naive first, then nova) over N seeds via
 * the worker sampling channels, and reports per-implementation metrics plus
 * exact histogram agreement — doubling as an interactive differential
 * checker.
 *
 * All benchmark logic lives in `../../hooks/dicexp-benchmark.ts` (its public
 * contract is consumed here, not reimplemented); preset workloads come from
 * `../../stores/benchmark-presets.ts`.
 *
 * Rendered inside the ControlPane card (as the content of the 基准 tab),
 * not as a standalone card.
 */
import {
  Component,
  createEffect,
  createSignal,
  For,
  lazy,
  Match,
  on,
  Show,
  Suspense,
  Switch,
} from "solid-js";

import { Button, Skeleton } from "../ui/mod";

import createDicexpBenchmark, {
  type BenchmarkRunState,
} from "../../hooks/dicexp-benchmark";
import * as store from "../../stores/store";
import { benchmarkPresets } from "../../stores/benchmark-presets";
import { BenchmarkOutcomeView } from "./result-pane/result-card-for-benchmark";

const LazyDicexpEditor = lazy(() => import("./dicexp-editor"));

export const BenchmarkPane: Component = () => {
  const [doc, setDoc] = createSignal(benchmarkPresets[0]!.code);
  const [sampleCount, setSampleCount] = createSignal(10_000);

  const bench = createDicexpBenchmark({ code: doc, sampleCount });

  // Every completed benchmark run (a finished or cancelled one — the hook's
  // outcome signal only changes identity when a run ends) lands in the
  // result pane as a keepable record; the tab also keeps showing the latest
  // outcome inline below. Same push pattern as control-pane.tsx for
  // evaluation results.
  createEffect(on([bench.outcome], () => {
    const outcome = bench.outcome();
    if (!outcome) return;
    store.pushRecord({
      type: "benchmark",
      code: outcome.code,
      outcome,
      date: new Date(),
    });
  }));

  // Same reset-to-placeholder pattern as the example select in
  // control-pane.tsx: after applying a preset, snap the select back to the
  // disabled placeholder option. Options carry the preset's index; the
  // label alone isn't guaranteed unique, and we need `defaultSampleCount`
  // too, which a plain code value couldn't provide.
  const [presetSelectValue, setPresetSelectValue] = createSignal("");
  createEffect(() => {
    const value = presetSelectValue();
    if (value === "") return;
    const preset = benchmarkPresets[Number(value)];
    if (preset) {
      setDoc(preset.code);
      setSampleCount(preset.defaultSampleCount);
    }
    setPresetSelectValue("");
  });

  // Editor Enter submits a run (only when inputs are valid and idle).
  function startIfPossible() {
    if (bench.canStart()) bench.start();
  }

  return (
    <>
      {/* 说明 */}
      <div class="text-xs text-gray-400 select-none">
        两个实现顺序运行（naive 先、nova 后）以保证计时公平；耗时包含每次抽样会话的一次性编译/解析开销；仅支持整数结果的表达式（抽样通道限制）。
      </div>

      {/* 表达式输入 */}
      <Suspense
        fallback={
          <div class="h-8">
            <Skeleton />
          </div>
        }
      >
        <LazyDicexpEditor
          class="border border-gray-500"
          doc={doc()}
          setDoc={setDoc}
          onSubmit={startIfPossible}
        />
      </Suspense>

      {/* 预设与运行控制 */}
      <div class="flex flex-wrap justify-center items-center gap-4">
        <select
          class="w-44"
          value={presetSelectValue()}
          onChange={(ev) => setPresetSelectValue(ev.target.value)}
        >
          <option value="" disabled>选择预设…</option>
          <For each={benchmarkPresets}>
            {(preset, i) => <option value={String(i())}>{preset.label}</option>}
          </For>
        </select>

        <div class="flex items-center gap-2">
          <span class="select-none">样本数</span>
          <input
            type="number"
            min="1"
            step="1"
            class="input input-sm w-28"
            value={sampleCount()}
            onInput={(ev) => {
              // Ignore non-numeric input (e.g. a cleared field) so the last
              // valid value stays; the hook validates positivity/integer-ness.
              const n = Number(ev.target.value);
              if (Number.isFinite(n)) setSampleCount(n);
            }}
          />
        </div>

        <Switch>
          <Match when={bench.status() === "preparing"}>
            <Button type="primary" disabled={true} loading={true} />
          </Match>
          <Match when={bench.status() === "running"}>
            <Button type="secondary" onClick={bench.cancel}>
              取消
            </Button>
          </Match>
          <Match when={true}>
            {/* idle | done */}
            <Button
              type="primary"
              disabled={!bench.canStart()}
              onClick={bench.start}
            >
              开始测试
            </Button>
          </Match>
        </Switch>
      </div>

      {/* 各实现的运行进度（idle 时隐藏） */}
      <Show when={bench.status() !== "idle"}>
        <div class="flex flex-col gap-1 text-sm">
          <For each={bench.runs()}>
            {(run) => <RunRow run={run} />}
          </For>
        </div>
      </Show>

      {/* 结果汇总表 */}
      <Show when={bench.outcome()}>
        {(outcome) => <BenchmarkOutcomeView outcome={outcome()} />}
      </Show>
    </>
  );
};

const RunRow: Component<{ run: BenchmarkRunState }> = (props) => {
  // Prefer the final, worker-measured stats once available; fall back to
  // the live reported progress while the run is ongoing.
  const final = () => props.run.final;
  const samples = () => final()?.samples ?? props.run.samplesDone;
  const elapsedMs = () => final()?.elapsedMs ?? props.run.elapsedMs;
  const throughput = () => {
    const ms = elapsedMs();
    if (ms <= 0) return null;
    return Math.round(samples() / (ms / 1000));
  };

  return (
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span class="font-medium">{props.run.implementation}</span>
      <span class="text-gray-400">{phaseText(props.run)}</span>
      <Show when={props.run.phase === "running" || props.run.phase === "done"}>
        <span>样本 {samples()}</span>
        <Show when={throughput() !== null}>
          <span>约 {throughput()} 样本/秒</span>
        </Show>
      </Show>
      <Show when={props.run.error}>
        {(error) => <span class="text-error">{error().message}</span>}
      </Show>
    </div>
  );
};

function phaseText(run: BenchmarkRunState): string {
  switch (run.phase) {
    case "pending":
      return "等待中";
    case "running":
      return "运行中";
    case "done":
      return "完成";
    case "error":
      return "出错";
  }
}
