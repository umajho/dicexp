import { Unreachable } from "@dicexp/errors";

import {
  Component,
  createEffect,
  createSignal,
  lazy,
  Match,
  on,
  Show,
  Suspense,
  Switch,
} from "solid-js";

import { ShowKeepAlive } from "../utils";
import { HiOutlineXMark } from "solid-icons/hi";
import { Button, Card, Skeleton, Tab, Tabs } from "../ui";
import { ResultErrorAlert } from "./ui";
import * as store from "../../stores/store";

import {
  EvaluationResultForWorker,
  ExecutionAppendix,
  JSValue,
  Repr,
  RuntimeError,
} from "dicexp/internal";
import { ErrorWithType, getErrorDisplayInfo } from "../../misc";

export const ResultPaneForSingle: Component<
  { result: EvaluationResultForWorker }
> = (
  props,
) => {
  // TODO: 如果未来 JSValue 包含 null，则将这里的 null 移出
  const [isOk, setIsOk] = createSignal(false),
    [resultValue, setResultValue] = createSignal<JSValue | null>(null),
    [appendix, setAppendix] = createSignal<ExecutionAppendix | null>(null),
    [error, setError] = createSignal<ErrorWithType | null>(null),
    [runtimeError, setRuntimeError] = createSignal<RuntimeError | null>(null);
  createEffect(on([() => props.result], () => {
    let isOk_ = false,
      resultValue_: JSValue | null = null,
      appendix_: ExecutionAppendix | null = null,
      error_: ErrorWithType | null = null,
      runtimeError_: RuntimeError | null = null;
    if (props.result[0] === "ok") {
      isOk_ = true;
      resultValue_ = props.result[1];
      appendix_ = props.result[2];
    } else if (props.result[0] === "error") {
      if (props.result[1] === "execute") {
        appendix_ = props.result[3];
        runtimeError_ = props.result[2];
      } else {
        error_ = props.result[2] as ErrorWithType;
        error_.type = props.result[1];
      }
    } else {
      error_ = new Unreachable() as ErrorWithType;
      error_.type = "other";
    }
    setIsOk(isOk_);
    setResultValue(resultValue_);
    setAppendix(appendix_);
    setError(error_);
    setRuntimeError(runtimeError_);
  }));

  const [currentTab, setCurrentTab] = createSignal<"result" | "representation">(
    "result",
  );

  return (
    <Card class="min-w-[80vw]" bodyClass="p-6 gap-4">
      <div class="flex">
        {/* 标签页 */}
        <Tabs class="flex-1">
          <Tab
            isActive={currentTab() === "result"}
            onClick={() => setCurrentTab("result")}
          >
            结果
          </Tab>
          <Tab
            isActive={currentTab() === "representation"}
            onClick={() => setCurrentTab("representation")}
          >
            步骤展现（WIP）
          </Tab>
        </Tabs>

        {/* 关闭 */}
        <Button
          icon={<HiOutlineXMark size={24} />}
          size="sm"
          shape="square"
          hasOutline={true}
          onClick={() => store.clearResult()}
        />
      </div>

      {/* 标签页下的内容 */}
      <Show when={currentTab() === "result"}>
        <ResultTab
          resultValue={resultValue}
          error={() => error() ?? runtimeError()}
        />
      </Show>
      <ShowKeepAlive
        when={() => currentTab() === "representation"}
      >
        <RepresentationTab representation={() => appendix()!.representation} />
      </ShowKeepAlive>

      {/* 统计 */}
      <Show when={appendix()?.statistics}>
        {(statis) => (
          <div class="flex-none text-xs text-slate-500">
            <div class="flex flex-col">
              <div>运行耗时：{statis().timeConsumption.ms} 毫秒</div>
              <Show when={statis().calls ?? null !== null}>
                <div>调用次数：{statis().calls!} 次</div>
              </Show>
              <Show when={statis().maxClosureCallDepth ?? null !== null}>
                <div>最大闭包调用深度：{statis().maxClosureCallDepth!} 层</div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Card>
  );
};

const ResultTab: Component<{
  resultValue: () => JSValue | null;
  error: () => ErrorWithType | RuntimeError | null;
}> = (props) => {
  const errorDisplayInfo = () => {
    const error_ = props.error();
    if (!error_) return null;
    if (error_ instanceof Error) {
      return getErrorDisplayInfo(error_.type);
    } else {
      return getErrorDisplayInfo("runtime");
    }
  };

  return (
    <Switch>
      <Match when={props.error()}>
        <ResultErrorAlert
          kind={errorDisplayInfo()!.kind}
          error={props.error()!}
          showsStack={errorDisplayInfo()!.showsStack}
        />
      </Match>
      <Match when={true}>
        <code class="break-all">{JSON.stringify(props.resultValue()!)}</code>
      </Match>
    </Switch>
  );
};

const LazyJsonViewer = lazy(() => import("../json-viewer"));

const RepresentationTab: Component<
  { representation: () => Repr; class?: string }
> = (props) => {
  return (
    <Suspense
      fallback={
        <div class="h-36">
          <Skeleton />
        </div>
      }
    >
      <LazyJsonViewer data={props.representation()} />
    </Suspense>
  );
};
