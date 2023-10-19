import { Unreachable } from "@dicexp/errors";

import {
  Component,
  createMemo,
  For,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";

import {
  DicexpEvaluation,
  registerRoWidgetOwner,
} from "@rotext/solid-components";

import { ExecutionAppendix } from "dicexp/internal";
import { EvaluationResultForWorker } from "@dicexp/evaluating-worker-manager/internal";

import { VsClearAll, VsClose } from "solid-icons/vs";
import { Button, Card } from "../ui";
import * as store from "../../stores/store";
import { ResultRecord } from "../../types";

import { DicexpResult, WIDGET_OWNER_CLASS } from "../ro-widget-dicexp";
import { Dynamic, Portal } from "solid-js/web";

export const ResultPane: Component<
  { records: () => ResultRecord[] }
> = (
  props,
) => {
  let widgetOwnerEl!: HTMLDivElement,
    widgetAnchorEl!: HTMLDivElement,
    resultHeadEl!: HTMLDivElement;

  onMount(() => {
    const controller = registerRoWidgetOwner(widgetOwnerEl, {
      widgetAnchorElement: widgetAnchorEl,
      level: 1,
    });
    const observer = new ResizeObserver(() => controller.nofityLayoutChange());
    observer.observe(widgetOwnerEl);
  });

  return (
    <Card
      ref={widgetOwnerEl}
      class={`min-w-[80vw] ${WIDGET_OWNER_CLASS}`}
      bodyClass="p-6 gap-0"
    >
      <div class="flex justify-between items-center">
        <div class="text-xl">结果（{props.records().length}）</div>
        {/* 清空 */}
        <Button
          icon={<VsClearAll size={24} />}
          size="sm"
          shape="square"
          hasOutline={true}
          onClick={() => store.clearResult()}
        />
      </div>

      <div ref={widgetAnchorEl} class="relative z-10" />
      <div class="flex flex-col gap-4">
        <Show when={props.records().length}>
          <div ref={resultHeadEl} />
          <div class="flex flex-col-reverse gap-4">
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
                    <Match when={true}>
                      TODO!
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
    };
  });

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-xl font-semibold border-b border-gray-500 w-full">
        <div class="flex gap-2 items-center">
          <Button
            icon={<VsClose size={18} />}
            size="xs"
            shape="square"
            hasOutline={true}
            onClick={() => store.clear(props.i)}
          />
          {dateToString(props.date)}
        </div>
      </h2>
      {/* TODO: 未展现的信息：错误种类、统计中 “运行耗时” 之外的统计项（如 “调用次数”）。 */}
      <DicexpResult code={props.code} evaluation={evaluation()} />
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
