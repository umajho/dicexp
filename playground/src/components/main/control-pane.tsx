import {
  Component,
  createEffect,
  createSignal,
  For,
  JSX,
  lazy,
  Match,
  Show,
  Suspense,
  Switch,
} from "solid-js";

import { EvaluationRestrictionsForWorker } from "dicexp/internal";

import {
  Button,
  LabelButton,
  OptionalNumberInput,
  Skeleton,
  Tab,
  Tabs,
} from "../ui";

import * as store from "../../stores/store";
import { examples } from "../../stores/examples";
import createDicexpEvaluator from "../../hooks/dicexp-evaluator";

const LazyDicexpEditor = lazy(() => import("./dicexp-editor"));

export const ControlPane: Component = () => {
  const [mode, setMode] = createSignal<"single" | "batch">("single");

  const [exampleSelectValue, setExampleSelectValue] = createSignal<string>("");
  createEffect(() => {
    if (exampleSelectValue() === "") return;
    store.setDoc(exampleSelectValue());
    setExampleSelectValue("");
  });

  const [seed, setSeed] = createSignal(0);
  const [isSeedFrozen, setIsSeedFrozen] = createSignal(false);
  const [restrictions, setRestrictions] = createSignal<
    EvaluationRestrictionsForWorker | null
  >(null);
  const [restrictionsText, setRestrictionsText] = createSignal("");

  const evaluator = createDicexpEvaluator(store.doc, {
    mode,
    seed,
    isSeedFrozen,
    restrictions,
    topLevelScopeName: () => "standard",
  });
  const rollingMode = () => {
    const theStatus = evaluator.status();
    if (theStatus.type !== "rolling") return null;
    return theStatus.mode;
  };
  createEffect(() => {
    store.setResult(evaluator.result());
  });

  function roll() {
    if (!isSeedFrozen()) {
      setSeed(crypto.getRandomValues(new Uint32Array(1))[0]);
    }
    evaluator.roll();
  }

  return (
    <Card class="pt-4 p-8">
      <div class="flex flex-col gap-4 min-w-[20rem] md:min-w-[36rem]">
        {/* 标签页和示例选择 */}
        <div class="flex items-center">
          {/* 选择模式用的标签页 */}
          <Tabs class="flex-1">
            <Tab
              isActive={mode() === "single"}
              onClick={() => setMode("single")}
              size="lg"
            >
              <span class="font-bold">单次</span>
            </Tab>
            <Tab
              isActive={mode() === "batch"}
              onClick={() => setMode("batch")}
              size="lg"
            >
              <span class="font-bold">批量</span>
            </Tab>
          </Tabs>

          {/* 示例选择 */}
          <select
            class="w-32"
            value={exampleSelectValue()}
            onChange={(ev) => setExampleSelectValue(ev.target.value)}
          >
            <option value="" disabled>查看示例</option>
            <For each={examples}>
              {(example) => (
                <option value={example.code}>
                  {example.label} | {example.code}
                </option>
              )}
            </For>
          </select>
        </div>

        {/* 输入框和按钮 */}
        <div class="flex justify-center items-center gap-6">
          {/* 输入框 */}
          <div class="flex flex-col justify-center h-full w-full">
            <LazyDicexpEditorWithSuspense
              doc={store.doc}
              setDoc={store.setDoc}
              onSubmit={roll}
            />
          </div>

          {/* 按钮 */}
          <Switch>
            <Match when={evaluator.status().type === "loading"}>
              <Button type="primary" disabled={true} loading={true} />
            </Match>
            <Match when={evaluator.status().type === "rolling"}>
              <Switch>
                <Match when={rollingMode() === "single"}>
                  <Button type="error" onClick={evaluator.terminate}>
                    终止
                  </Button>
                </Match>
                <Match when={rollingMode() === "batch"}>
                  <Button type="secondary" onClick={evaluator.stopBatching}>
                    停止
                  </Button>
                </Match>
              </Switch>
            </Match>
            <Match when={true}>
              <Button
                type="primary"
                disabled={evaluator.status().type !== "ready"}
                onClick={roll}
              >
                ROLL!
              </Button>
            </Match>
          </Switch>
        </div>

        {/* 基本的设置 */}
        <div class="flex flex-col md:flex-row md:h-8 justify-center gap-4">
          {/* 种子 */}
          <Show when={mode() === "single"}>
            <OptionalNumberInput
              number={seed()}
              setNumber={setSeed}
              enabled={isSeedFrozen()}
              setEnabled={(enabled) => setIsSeedFrozen(enabled)}
            >
              固定种子
            </OptionalNumberInput>
            <span class="max-md:hidden">|</span>
          </Show>

          {/* 限制 */}
          <LabelButton
            for="restrictions-modal"
            type="info"
            size="sm"
            class="normal-case"
          >
            {restrictionsText()}
          </LabelButton>
          <RestrictionsModal
            mode={mode()}
            setRestrictions={setRestrictions}
            setRestrictionsText={setRestrictionsText}
          />
        </div>
      </div>
    </Card>
  );
};

const RestrictionsModal: Component<{
  mode: "single" | "batch";
  setRestrictions: (
    restrictions: EvaluationRestrictionsForWorker | null,
  ) => void;
  setRestrictionsText: (text: string) => void;
}> = (props) => {
  const [hardTimeout, setHardTimeout] = createSignal(100);
  const [hardTimeoutEnabled, setHardTimeoutEnabled] = createSignal(true);

  const [softTimeout, setSoftTimeout] = createSignal(50);
  const [softTimeoutEnabled, setSoftTimeoutEnabled] = createSignal(false);

  const [maxCalls, setMaxCalls] = createSignal(2000);
  const [maxCallsEnabled, setMaxCallsEnabled] = createSignal(false);

  // TODO: maxClosureCallDepth 最大闭包调用深度

  createEffect(() => {
    const restrictions: EvaluationRestrictionsForWorker = {
      ...(hardTimeoutEnabled() ? { hardTimeout: { ms: hardTimeout() } } : {}),
      execute: {
        ...(softTimeoutEnabled() ? { softTimeout: { ms: softTimeout() } } : {}),
        ...(maxCallsEnabled() ? { maxCalls: maxCalls() } : {}),
      },
    };
    if (Object.keys(restrictions).length === 0) {
      props.setRestrictions(null);
    } else {
      props.setRestrictions(restrictions);
    }
  });

  createEffect(() => {
    const items: string[] = [];
    if (props.mode === "single" && hardTimeoutEnabled()) {
      items.push(`硬性超时=${hardTimeout()}ms`);
    }
    if (softTimeoutEnabled()) {
      items.push(`软性超时=${softTimeout()}ms`);
    }
    if (maxCallsEnabled()) {
      items.push(`调用次数=${maxCalls()}`);
    }
    // if (maxClosureCallDepthEnabled()) {
    //   items.push(`最大闭包调用深度=${maxClosureCallDepth()}`);
    // }
    if (items.length) {
      props.setRestrictionsText("单次限制：" + items.join("，"));
    } else {
      props.setRestrictionsText("无限制");
    }
  });

  return (
    <>
      <input type="checkbox" id="restrictions-modal" class="modal-toggle" />
      <div class="modal">
        <div class="modal-box">
          <div class="flex flex-col gap-4">
            <h1 class="text-xl">单次限制</h1>

            <div class="flex flex-col">
              <OptionalNumberInput
                number={hardTimeout()}
                setNumber={setHardTimeout}
                enabled={hardTimeoutEnabled()}
                setEnabled={setHardTimeoutEnabled}
              >
                <span title="超过后强制停止，无法保留运行时信息。">
                  硬性超时（毫秒）
                </span>
              </OptionalNumberInput>
              <div class="flex justify-center">
                <div class="text-xs text-gray-400">
                  （硬性超时在批量模式下不生效）
                </div>
              </div>
            </div>

            <OptionalNumberInput
              number={softTimeout()}
              setNumber={setSoftTimeout}
              enabled={softTimeoutEnabled()}
              setEnabled={setSoftTimeoutEnabled}
            >
              <span title="运行时尝试在超过后停止，保留运行时信息。">
                软性超时（毫秒）
              </span>
            </OptionalNumberInput>

            <OptionalNumberInput
              number={maxCalls()}
              setNumber={setMaxCalls}
              enabled={maxCallsEnabled()}
              setEnabled={setMaxCallsEnabled}
            >
              <span title="直接或间接地调用通常函数、闭包或捕获都会计入。">
                {"　　" /* 偷个懒，不用正确的方式对齐了 */}最多调用次数
              </span>
            </OptionalNumberInput>
          </div>

          <div class="modal-action">
            <LabelButton for="restrictions-modal">确定</LabelButton>
          </div>
        </div>
      </div>
    </>
  );
};

// 由于不是标准的 daisy-ui card（缺少 card-body），就直接放在这里
const Card: Component<{ children: JSX.Element; class?: string }> = (props) => {
  return (
    <div class={`card bg-base-100 shadow-xl ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
};

const LazyDicexpEditorWithSuspense: Component<
  { doc: () => string; setDoc: (doc: string) => void; onSubmit: () => void }
> = (props) => {
  return (
    <Suspense
      fallback={
        <div class="h-8">
          <Skeleton />
        </div>
      }
    >
      <LazyDicexpEditor
        class="border border-gray-500"
        doc={props.doc()}
        setDoc={props.setDoc}
        onSubmit={props.onSubmit}
      />
    </Suspense>
  );
};
