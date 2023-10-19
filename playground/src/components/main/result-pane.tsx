import { Unreachable } from "@dicexp/errors";

import {
  Component,
  createMemo,
  For,
  Match,
  onMount,
  Switch,
} from "solid-js";

import {
  DicexpEvaluation,
  registerRoWidgetOwner,
} from "@rotext/solid-components";

import { ExecutionAppendix } from "dicexp/internal";
import { EvaluationResultForWorker } from "@dicexp/evaluating-worker-manager/internal";

import { VsClearAll } from "solid-icons/vs";
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
      bodyClass="p-6"
    >
      <div class="flex justify-between items-center">
        <div class="text-xl">结果</div>
        {/* 关闭 */}
        <Button
          icon={<VsClearAll size={24} />}
          size="sm"
          shape="square"
          hasOutline={true}
          onClick={() => store.clearResult()}
        />
      </div>

      <div ref={widgetAnchorEl} class="relative z-10" />
      <div class="flex flex-col gap-2">
        <div ref={resultHeadEl} />
        <div class="flex flex-col-reverse gap-2">
          <For each={props.records()}>
            {(record, i) => {
              const isHead = () => i() === props.records.length - 1;
              return (
                <Dynamic
                  component={isHead()
                    ? Portal
                    : ({ children }) => <>{children}</>}
                  mount={isHead() ? resultHeadEl : undefined}
                >
                  <Switch>
                    <Match when={record[0] === "single"}>
                      {(() => {
                        const [_, code, result] = record as //
                        Extract<ResultRecord, { 0: "single" }>;
                        const props = { code, result };
                        return <SingleResultBlock {...props} />;
                      })()}
                    </Match>
                    <Match when={true}>
                      TODO!
                    </Match>
                  </Switch>
                </Dynamic>
              );
            }}
          </For>
        </div>
      </div>
    </Card>
  );
};

const SingleResultBlock: Component<
  { code: string; result: EvaluationResultForWorker }
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
    };
  });

  return (
    <div>
      {/* TODO: 未展现的信息：错误种类、统计中 “运行耗时” 之外的统计项（如 “调用次数”）。 */}
      <DicexpResult code={props.code} evaluation={evaluation()} />
    </div>
  );
};
