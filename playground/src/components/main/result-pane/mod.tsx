import {
  Component,
  createMemo,
  createSignal,
  For,
  JSX,
  Match,
  Show,
  Switch,
} from "solid-js";
import { Dynamic, Portal } from "solid-js/web";

import {
  VsChevronDown,
  VsChevronUp,
  VsClearAll,
  VsClose,
} from "solid-icons/vs";

import * as Ankor from "ankor";
import { DicexpEvaluation } from "@rotext/solid-components";

import type * as I from "@dicexp/interface";

import { Button, Card, Loading } from "../../ui/mod";
import * as store from "../../../stores/store";
import { ResultRecord, SamplingReportForPlayground } from "../../../types";
import { DicexpResult } from "../../../custom-elements/dicexp";
import { ErrorAlert } from "../ui";
import { SamplingResultCard } from "./result-card-for-sampling";

export const ResultPane: Component<
  { class?: string; records: () => ResultRecord[] }
> = (
  props,
) => {
  let widgetOwnerEl!: HTMLDivElement,
    resultHeadEl!: HTMLDivElement;

  const [isHeadResultOnly, setIsHeadResultOnly] = createSignal(false);

  const isAnySamplingRunning = createMemo(() =>
    props.records()
      .some((r) => r.type === "sampling" && isSamplingRunning(r.report()))
  );

  const widgetOwnerData = createMemo(() =>
    JSON.stringify(
      { level: 1 } satisfies Ankor.WidgetOwnerRaw,
    )
  );

  return (
    <Card
      ref={widgetOwnerEl}
      class={`min-w-[100vw] sm:min-w-[80vw] max-w-[100vw] ${props.class ?? ""}`}
      bodyClass="py-6 px-4 sm:px-6 gap-0"
    >
      <div
        class={Ankor.WIDGET_OWNER_CLASS}
        data-ankor-widget-owner={widgetOwnerData()}
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
              disabled={isAnySamplingRunning()}
              onClick={() => store.clearResult()}
            />
          </div>
        </div>

        <div class={`${Ankor.ANCHOR_CLASS} relative z-10`} />
        <div class={`${Ankor.CONTENT_CLASS} flex flex-col gap-4`}>
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
                      <Match when={record.type === "sampling"}>
                        {(() => {
                          const { code, report, date } = record as //
                          Extract<ResultRecord, { type: "sampling" }>;
                          const props = { code, report, date };
                          return <SamplingResultBlock i={i()} {...props} />;
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
                        : (({ children }) => <>{children}
                        </>) satisfies Component<
                          { children: JSX.Element }
                        >}
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
      </div>
    </Card>
  );
};

const SingleResultBlock: Component<
  {
    i: number;
    code: string;
    result: I.EvaluationResult;
    date: Date;
    environment?: NonNullable<DicexpEvaluation["environment"]>;
  }
> = (
  props,
) => {
  const evaluation = createMemo((): DicexpEvaluation | null => {
    if (!props.result) return null;

    let result: DicexpEvaluation["result"];
    let appendix: I.ExecutionAppendix | undefined;

    if (props.result[0] === "ok") {
      result = ["value", props.result[1]];
      appendix = props.result[2];
    } else if (props.result[0] === "error") {
      const kind = props.result[1];
      if (kind === "runtime") {
        const runtimeError = props.result[2];
        result = ["error", kind, runtimeError.message];
        appendix = props.result[3];
      } else {
        result = ["error", kind, props.result[2].message];
      }
    } else {
      result = ["error", "other", "（内部实现问题：不可能到达的分支）"];
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

const SamplingResultBlock: Component<{
  i: number;
  code: string;
  report: () => SamplingReportForPlayground;
  date: Date;
}> = (
  props,
) => {
  const isRunning = createMemo(() => isSamplingRunning(props.report()));

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
          <span>抽样</span>
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
          <SamplingResultCard
            code={props.code}
            report={props.report() as I.SamplingReport}
          />
        </Show>
      </h2>
    </div>
  );
};

function isSamplingRunning(report: SamplingReportForPlayground) {
  return report === "preparing" || report[0] === "continue";
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
