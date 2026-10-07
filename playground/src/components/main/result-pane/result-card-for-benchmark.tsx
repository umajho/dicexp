/**
 * The benchmark result card (as shown in the result pane) — a keepable
 * record like the single/sampling result cards. The outcome view is also
 * reused inline by the benchmark tab (see `../benchmark-pane.tsx`).
 */
import { Component, For, Match, Show, Switch } from "solid-js";

import type { BenchmarkOutcome, BenchmarkRunState } from "../../../types";

export const BenchmarkOutcomeView: Component<{ outcome: BenchmarkOutcome }> = (
  props,
) => {
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

/** The code shown above the outcome, styled like the sampling result card's. */
export const BenchmarkResultCard: Component<{
  code: string;
  outcome: BenchmarkOutcome;
}> = (props) => {
  return (
    <div class="flex flex-col gap-2">
      <p class="card-title">
        <code>{props.code}</code>
      </p>
      <BenchmarkOutcomeView outcome={props.outcome} />
    </div>
  );
};
