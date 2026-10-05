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
 */
import {
  Component,
  createEffect,
  createSignal,
  For,
  lazy,
  Match,
  Show,
  Suspense,
  Switch,
} from "solid-js";

import { Button, Card, Skeleton } from "../ui/mod";

import createDicexpBenchmark, {
  type BenchmarkOutcome,
  type BenchmarkRunState,
} from "../../hooks/dicexp-benchmark";
import { benchmarkPresets } from "../../stores/benchmark-presets";

const LazyDicexpEditor = lazy(() => import("./dicexp-editor"));

export const BenchmarkPane: Component = () => {
  const [doc, setDoc] = createSignal(benchmarkPresets[0]!.code);
  const [sampleCount, setSampleCount] = createSignal(10_000);

  const bench = createDicexpBenchmark({ code: doc, sampleCount });

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
    <Card
      class="min-w-full sm:min-w-[40rem]"
      bodyClass="flex flex-col gap-4 pt-4 pb-8 px-4 sm:px-8"
    >
      {/* 标题与说明 */}
      <div class="flex flex-col gap-1">
        <div class="text-lg font-bold">基准测试（naive vs nova）</div>
        <div class="text-xs text-gray-400 select-none">
          两个实现顺序运行（naive 先、nova 后）以保证计时公平；耗时包含每次抽样会话的一次性编译/解析开销；仅支持整数结果的表达式（抽样通道限制）。
        </div>
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
        {(outcome) => <OutcomeView outcome={outcome()} />}
      </Show>
    </Card>
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

const OutcomeView: Component<{ outcome: BenchmarkOutcome }> = (props) => {
  const runs = () => props.outcome.runs;

  return (
    <div class="flex flex-col gap-2 text-sm">
      <table class="table table-zebra table-sm">
        <thead>
          <tr>
            <th />
            <For each={runs()}>
              {(run) => <th>{run.implementation}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>样本数</th>
            <For each={runs()}>
              {(run) => <td>{samplesCell(run, props.outcome.targetSamples)}</td>}
            </For>
          </tr>
          <tr>
            <th>总耗时（毫秒）</th>
            <For each={runs()}>
              {(run) => <td>{elapsedCell(run)}</td>}
            </For>
          </tr>
          <tr>
            <th>平均每样本（微秒）</th>
            <For each={runs()}>
              {(run) => <td>{microsCell(run)}</td>}
            </For>
          </tr>
          <tr>
            <th>吞吐（样本/秒）</th>
            <For each={runs()}>
              {(run) => <td>{throughputCell(run)}</td>}
            </For>
          </tr>
        </tbody>
      </table>

      <div class="flex flex-col gap-1">
        <Show when={speedupText(props.outcome)}>
          {(speedup) => (
            <div>
              加速比：<span>{speedup()}</span>
            </div>
          )}
        </Show>
        <div class="flex items-baseline gap-2">
          <span>结果一致性：</span>
          <Switch>
            <Match when={props.outcome.agreement === true}>
              <span class="text-success">✓ 结果一致（直方图完全相同）</span>
            </Match>
            <Match when={props.outcome.agreement === false}>
              <span class="text-error">✗ 结果不一致！</span>
            </Match>
            <Match when={true}>
              <span class="text-gray-400">— 无法比较（运行未完成或出错）</span>
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  );
};

function speedupText(outcome: BenchmarkOutcome): string | null {
  const speedup = outcome.speedup;
  return speedup === null ? null : `${speedup.toFixed(2)}×`;
}

function formatElapsedMs(ms: number): string {
  const rounded = Math.round(ms);
  if (rounded < 1000) return String(rounded);
  return `${rounded}（${(ms / 1000).toFixed(1)} 秒）`;
}

function noData() {
  // Fresh element on every call (a shared JSX node can't be mounted twice).
  return <span class="text-gray-400">—</span>;
}

function samplesCell(run: BenchmarkRunState, targetSamples: number) {
  if (run.phase === "error") return noData();
  const final = run.final;
  if (!final) return noData();
  if (final.samples >= targetSamples) return <>{final.samples}</>;
  return (
    <>
      {final.samples}
      <span class="text-gray-400">（已取消，仅部分样本）</span>
    </>
  );
}

function elapsedCell(run: BenchmarkRunState) {
  if (run.phase === "error") return noData();
  const final = run.final;
  if (!final) return noData();
  return formatElapsedMs(final.elapsedMs);
}

function microsCell(run: BenchmarkRunState) {
  const final = run.final;
  if (run.phase === "error" || !final || final.samples <= 0) return noData();
  return <>{(final.elapsedMs * 1000 / final.samples).toFixed(2)}</>;
}

function throughputCell(run: BenchmarkRunState) {
  const final = run.final;
  if (run.phase === "error" || !final || final.samples < 1) return noData();
  return <>{String(Math.round(final.samples / (final.elapsedMs / 1000)))}</>;
}
