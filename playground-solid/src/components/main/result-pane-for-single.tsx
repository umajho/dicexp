import {
  Component,
  createEffect,
  createSignal,
  lazy,
  Match,
  Show,
  Suspense,
  Switch,
} from "solid-js";

import { Card, Skeleton, Tab, Tabs } from "../ui";
import { ResultErrorAlert } from "./ui";

import type { RuntimeStatistics } from "dicexp/internal";
import type { EvaluationResultForWorker } from "dicexp/internal";
import { getErrorDisplayInfo } from "../../misc";

export const ResultPaneForSingle: Component<
  { result: EvaluationResultForWorker }
> = (
  props,
) => {
  const statis = (): RuntimeStatistics | null => {
    return props.result.statistics ?? null;
  };

  const [currentTab, setCurrentTab] = createSignal<"result" | "representation">(
    "result",
  );
  const [representationTabLoaded, setRepresentationTabLoaded] = createSignal(
    false,
  );
  createEffect(() => {
    if (currentTab() === "representation") {
      setRepresentationTabLoaded(true);
    }
  });

  return (
    <Card class="min-w-[80vw]" bodyClass="p-6">
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

        {/* 统计 */}
        <Show when={statis() !== null}>
          <div class="flex-none text-xs text-slate-500">
            <div class="flex flex-col">
              <div>运行耗时：{statis()!.timeConsumption.ms} 毫秒</div>
              <Show when={statis()!.calls ?? null !== null}>
                <div>调用次数：{statis()!.calls!} 次</div>
              </Show>
              <Show when={statis()!.maxClosureCallDepth ?? null !== null}>
                <div>最大闭包调用深度：{statis()!.maxClosureCallDepth!} 层</div>
              </Show>
            </div>
          </div>
        </Show>
      </div>

      <div class="h-2" />

      {/* 标签页下的内容 */}
      <Show when={currentTab() === "result"}>
        <ResultTab result={props.result} />
      </Show>
      <Show
        when={currentTab() === "representation" || representationTabLoaded()}
      >
        <div class={currentTab() === "representation" ? "" : "hidden"}>
          <RepresentationTab result={props.result} />
        </div>
      </Show>
    </Card>
  );
};

const ResultTab: Component<{ result: EvaluationResultForWorker }> = (props) => {
  const errorDisplayInfo = () => {
    if (!props.result.error) return null;
    return getErrorDisplayInfo(props.result.specialErrorType);
  };

  return (
    <Switch>
      <Match when={props.result.error}>
        <ResultErrorAlert
          kind={errorDisplayInfo()!.kind}
          error={props.result.error!}
          showsStack={errorDisplayInfo()!.showsStack}
        />
      </Match>
      <Match when={true}>
        <code class="break-all">{JSON.stringify(props.result.ok!)}</code>
      </Match>
    </Switch>
  );
};

const LazyJsonViewer = lazy(() => import("../json-viewer"));

const RepresentationTab: Component<
  { result: EvaluationResultForWorker; class?: string }
> = (props) => {
  return (
    <Suspense
      fallback={
        <div class="h-36">
          <Skeleton />
        </div>
      }
    >
      <LazyJsonViewer data={props.result.representation} />
    </Suspense>
  );
};
