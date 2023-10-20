import { Unreachable } from "@dicexp/errors";

import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onMount,
  Show,
  Switch,
} from "solid-js";

import {
  DicexpEvaluation,
  registerRoWidgetOwner,
} from "@rotext/solid-components";

import { ExecutionAppendix } from "dicexp/internal";
import {
  BatchReportForWorker,
  EvaluationResultForWorker,
} from "@dicexp/evaluating-worker-manager/internal";

import {
  VsChevronDown,
  VsChevronUp,
  VsClearAll,
  VsClose,
} from "solid-icons/vs";
import { Button, Card, Loading } from "../../ui";
import * as store from "../../../stores/store";
import { BatchReportForPlayground, ResultRecord } from "../../../types";

import { DicexpResult, WIDGET_OWNER_CLASS } from "../../ro-widget-dicexp";
import { Dynamic, Portal } from "solid-js/web";
import { ErrorAlert } from "../ui";
import { BatchResultCard } from "./result-card-for-batch";

export const ResultPane: Component<
  { class?: string; records: () => ResultRecord[] }
> = (
  props,
) => {
  let widgetOwnerEl!: HTMLDivElement,
    widgetAnchorEl!: HTMLDivElement,
    resultHeadEl!: HTMLDivElement;

  const [isHeadResultOnly, setIsHeadResultOnly] = createSignal(false);

  onMount(() => {
    const controller = registerRoWidgetOwner(widgetOwnerEl, {
      widgetAnchorElement: widgetAnchorEl,
      level: 1,
    });
    const observer = new ResizeObserver(() => controller.nofityLayoutChange());
    observer.observe(widgetOwnerEl);
    createEffect(on(props.records, () => controller.nofityLayoutChange()));
  });

  const isAnyBatchRunning = createMemo(() =>
    props.records()
      .some((r) => r.type === "batch" && isBatchRunning(r.report()))
  );

  return (
    <Card
      ref={widgetOwnerEl}
      class={`min-w-[100vw] sm:min-w-[80vw] max-w-[100vw] ${WIDGET_OWNER_CLASS} ${
        props.class ?? ""
      }`}
      bodyClass="py-6 px-4 sm:px-6 gap-0"
    >
      <div class="flex justify-between items-center">
        <div class="text-xl">结果（{props.records().length}）</div>
        <div class="flex gap-4">
          {/* 折叠 */}
          <Button
            icon={
              <Dynamic
                component={isHeadResultOnly() ? VsChevronUp : VsChevronDown}
                size={24}
              />
            }
            size="sm"
            shape="square"
            hasOutline={true}
            onClick={() => setIsHeadResultOnly(!isHeadResultOnly())}
          />
          {/* 清空 */}
          <Button
            icon={<VsClearAll size={24} />}
            size="sm"
            shape="square"
            hasOutline={true}
            disabled={isAnyBatchRunning()}
            onClick={() => store.clearResult()}
          />
        </div>
      </div>

      <div ref={widgetAnchorEl} class="relative z-10" />
      <div class="flex flex-col gap-4">
        <Show when={props.records().length}>
          <div ref={resultHeadEl} class="pt-2" />
          <Show when={isHeadResultOnly() && props.records().length > 1}>
            <div
              class="flex justify-center items-center"
              onClick={() => setIsHeadResultOnly(false)}
            >
              <span class="text-sm text-gray-300 cursor-pointer select-none underline">
                {`已隐藏 ${props.records().length - 1} 条先前的结果`}
              </span>
            </div>
          </Show>
          <div
            class="flex flex-col-reverse gap-4"
            style={{ display: isHeadResultOnly() ? "none" : undefined }}
          >
            <For each={props.records()}>
              {(record, i) => {
                const isHead = () => i() === props.records().length - 1;
                const block = (
                  <Switch>
                    <Match when={record.type === "single"}>
                      {(() => {
                        const props = record as //
                        Extract<ResultRecord, { type: "single" }>;
                        return <SingleResultBlock i={i()} {...props} />;
                      })()}
                    </Match>
                    <Match when={record.type === "batch"}>
                      {(() => {
                        const { report, date } = record as //
                        Extract<ResultRecord, { type: "batch" }>;
                        const props = { report, date };
                        return <BatchResultBlock i={i()} {...props} />;
                      })()}
                    </Match>
                    <Match when={record.type === "error"}>
                      {(() => {
                        const { error, date } = record as //
                        Extract<ResultRecord, { type: "error" }>;
                        const props = { error, date };
                        return <ErrorResultBlock i={i()} {...props} />;
                      })()}
                    </Match>
                    <Match when={true}>
                      Unreachable!
                    </Match>
                  </Switch>
                );
                return (
                  <Dynamic
                    component={isHead()
                      ? Portal
                      : ({ children }) => <>{children}</>}
                    mount={isHead() ? resultHeadEl : undefined}
                  >
                    {block}
                  </Dynamic>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </Card>
  );
};

const SingleResultBlock: Component<
  {
    i: number;
    code: string;
    result: EvaluationResultForWorker;
    date: Date;
    environment?: NonNullable<DicexpEvaluation["environment"]>;
  }
> = (
  props,
) => {
  const evaluation = createMemo((): DicexpEvaluation | null => {
    if (!props.result) return null;

    let result: DicexpEvaluation["result"];
    let appendix: ExecutionAppendix | undefined;

    if (props.result[0] === "ok") {
      result = ["value", props.result[1]];
      appendix = props.result[2];
    } else if (props.result[0] === "error") {
      if (props.result[1] === "execute") {
        const runtimeError = props.result[2];
        result = ["error", runtimeError.message];
        appendix = props.result[3];
      } else {
        result = ["error", props.result[2]];
      }
    } else {
      result = ["error", new Unreachable()];
    }

    return {
      result,
      repr: appendix?.representation,
      statistics: appendix?.statistics,
      environment: props.environment,
      location: "local",
    };
  });

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold border-b border-gray-500 w-full">
        <div class="inline-flex flex-wrap gap-2 items-center">
          <Button
            icon={<VsClose size={18} />}
            size="xs"
            shape="square"
            hasOutline={true}
            onClick={() => store.clear(props.i)}
          />
          <span>单次</span>
          <span>{dateToString(props.date)}</span>
        </div>
      </h2>
      {/* TODO: 未展现的信息：错误种类、统计中 “运行耗时” 之外的统计项（如 “调用次数”）。 */}
      <DicexpResult code={props.code} evaluation={evaluation()} />
    </div>
  );
};

const BatchResultBlock: Component<{
  i: number;
  report: () => BatchReportForPlayground;
  date: Date;
}> = (
  props,
) => {
  const isRunning = createMemo(() => isBatchRunning(props.report()));

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold border-b border-gray-500 w-full">
        <div class="inline-flex flex-wrap gap-2 items-center">
          <Button
            icon={<VsClose size={18} />}
            size="xs"
            shape="square"
            hasOutline={true}
            disabled={isRunning()}
            onClick={() => store.clear(props.i)}
          />
          <span>批量</span>
          <span>{dateToString(props.date)}</span>
        </div>
        <Show
          when={props.report() !== "preparing"}
          fallback={
            <div class="flex justify-center w-full h-20">
              <Loading />
            </div>
          }
        >
          <BatchResultCard report={props.report() as BatchReportForWorker} />
        </Show>
      </h2>
    </div>
  );
};

function isBatchRunning(report: BatchReportForPlayground) {
  return report === "preparing" || report[0] === "ok";
}

const ErrorResultBlock: Component<{
  i: number;
  error: Error;
  date: Date;
}> = (
  props,
) => {
  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold border-b border-gray-500 w-full">
        <div class="inline-flex flex-wrap gap-2 items-center">
          <Button
            icon={<VsClose size={18} />}
            size="xs"
            shape="square"
            hasOutline={true}
            onClick={() => store.clear(props.i)}
          />
          <span>错误</span>
          <span>{dateToString(props.date)}</span>
        </div>
        <ErrorAlert error={props.error} showsStack={true} />
      </h2>
    </div>
  );
};

function dateToString(d: Date) {
  const datePart = [
    d.getFullYear(),
    ...[d.getMonth() + 1, d.getDate()].map((n) => padTwoZeros(n)),
  ].join("/");
  const timePart = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => padTwoZeros(n))
    .join(":") +
    `.${d.getMilliseconds()}`;
  return `${datePart} ${timePart}`;
}

function padTwoZeros(input: number) {
  return String(input).padStart(2, "0");
}
