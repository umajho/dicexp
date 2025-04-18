import { Unreachable } from "@dicexp/errors";

import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  lazy,
  on,
  Show,
  Suspense,
} from "solid-js";

import { Card, Loading } from "../../ui/mod";
import { ErrorAlert } from "../ui";

import type * as I from "@dicexp/interface";

import { ErrorWithType, getErrorDisplayInfo } from "../../../misc";

const LazyBarChartForBatchResult = lazy(() =>
  import("./bar-chart-for-batch-result")
);

const numberFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export const SamplingResultCard: Component<{
  code: string;
  report: I.SamplingReport;
}> = (
  props,
) => {
  const [statis, setStatis] = createSignal<I.SamplingStatistic | null>(null),
    [result, setResult] = createSignal<I.SamplingResult | null>(null),
    [error, setError] = createSignal<ErrorWithType | null>(null);
  createEffect(on([() => props.report], () => {
    let statis_: I.SamplingStatistic | null = null,
      result_: I.SamplingResult | null = null,
      error_: ErrorWithType | null = null;
    if (props.report[0] === "continue" || props.report[0] === "stop") {
      statis_ = props.report[2], result_ = props.report[1];
    } else if (props.report[0] === "error") {
      error_ = props.report[2] as ErrorWithType;
      error_.type = props.report[1];
      if (props.report[1] === "sampling") {
        statis_ = props.report[4], result_ = props.report[3];
      }
    } else {
      error_ = new Unreachable() as ErrorWithType;
      error_.type = "other";
    }
    setStatis(statis_);
    setResult(result_);
    setError(error_);
  }));

  const timeConsumption = createMemo(() => {
    const statis_ = statis();
    if (!statis_) return null;
    return statis_.now.ms - statis_.start.ms;
  });
  const statisText = createMemo(() => {
    const result_ = result();
    return {
      samples: result_?.samples.toLocaleString(),
      ...(timeConsumption()
        ? { duration: numberFormat.format(timeConsumption()! / 1000) }
        : {}),
      ...(timeConsumption() && result_
        ? {
          speed: numberFormat.format(
            (result_.samples / timeConsumption()!) * 1000,
          ),
        }
        : {}),
    };
  });

  const errorDisplayInfo = () => {
    const error_ = error();
    if (!error_) return null;
    return getErrorDisplayInfo(error_.type);
  };

  const [highlighted, setHighlighted] = createSignal<number | null>(null);

  const chartSizeClass = () =>
    "w-[min(25rem,calc(100vw-4rem))] md:w-60 lg:w-80";

  return (
    <Card class="min-w-[80vw] bg-base-200" bodyClass="py-6 px-4 sm:px-6 gap-4">
      <Show when={error()}>
        <ErrorAlert
          kind={errorDisplayInfo()!.kind}
          error={error()!}
          showsStack={errorDisplayInfo()!.showsStack}
        />
      </Show>

      <p class="card-title">
        <code>{props.code}</code>
      </p>

      {/* 条形图 */}
      <Show when={(result()?.samples ?? 0) > 0}>
        <div class="flex flex-col md:flex-row justify-around items-center gap-2 max-md:divide-y">
          <LazyBarChartForBatchResultWithSuspense
            report={() =>
              result()!}
            mode={() =>
              "at-least"}
            highlighted={highlighted}
            setHighlighted={setHighlighted}
            sizeClass={chartSizeClass}
          />

          <LazyBarChartForBatchResultWithSuspense
            report={() => result()!}
            mode={() => "normal"}
            highlighted={highlighted}
            setHighlighted={setHighlighted}
            sizeClass={chartSizeClass}
          />

          <LazyBarChartForBatchResultWithSuspense
            report={() => result()!}
            mode={() => "at-most"}
            highlighted={highlighted}
            setHighlighted={setHighlighted}
            sizeClass={chartSizeClass}
          />
        </div>
      </Show>

      {/* 统计 */}
      <Show when={statis()}>
        <div class="flex flex-col text-xs text-slate-500">
          <Show when={statisText()!.samples}>
            <div>
              <span class="font-mono">样本：{statisText()!.samples}个</span>
            </div>
          </Show>

          <Show when={statisText()!.duration}>
            <div>
              <span class="font-mono">
                {props.report[0] === "continue"
                  ? ""
                  : "目前"}用时：{statisText()!
                  .duration}秒
              </span>
            </div>
          </Show>

          <Show when={statisText()!.speed}>
            <div>
              <span class="font-mono">
                平均效率：{statisText()!.speed}个/秒
              </span>
            </div>
          </Show>
        </div>
      </Show>
    </Card>
  );
};

const LazyBarChartForBatchResultWithSuspense: Component<{
  report: () => I.SamplingResult;
  mode: () => "normal" | "at-least" | "at-most";
  highlighted: () => number | null;
  setHighlighted: (value: number | null) => void;
  sizeClass: () => string;
}> = (props) => {
  return (
    <Suspense
      fallback={
        <div class={`flex justify-center items-center ${props.sizeClass()}`}>
          <Loading type="bars" size="lg" />
        </div>
      }
    >
      <LazyBarChartForBatchResult
        class={props.sizeClass()}
        report={props.report()}
        mode={props.mode()}
        highlighted={props.highlighted()}
        setHighlighted={props.setHighlighted}
      />
    </Suspense>
  );
};
