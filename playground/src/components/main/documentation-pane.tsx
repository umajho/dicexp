import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  on,
  onMount,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import { render } from "solid-js/web";
import { createBreakpoints } from "@solid-primitives/media";

import {
  ElementLayoutChangeObserver,
  registerRoWidgetOwner,
} from "@rotext/solid-components";

import {
  RegularFunctionDocumentation,
  RegularFunctionParameterTypeSpec,
} from "@dicexp/interface";
import { localizeValueType } from "@dicexp/l10n";

import { VsSymbolMethod, VsSymbolOperator } from "solid-icons/vs";
import { Badge, Button, Card, Input, Join, Tab, Tabs } from "../ui/mod";
import { ShowKeepAlive } from "../utils";

import { scopes, totalRegularFunctions } from "../../stores/scope-info";
import { WIDGET_OWNER_CLASS } from "../ro-widget-dicexp";
import FixedMasonry from "../FixedMasonry";

const gettingStartUrl =
  "https://github.com/umajho/dicexp/blob/main/docs/Dicexp.md";

export const DocumentationPane: Component = () => {
  const [currentTab, setCurrentTab] = createSignal<
    "regular-functions" | "getting-started"
  >("regular-functions");

  return (
    <Card
      class="w-full h-fit"
      bodyClass="p-3 sm:p-6 gap-4"
    >
      <Tabs class="flex-1">
        <Tab
          isActive={currentTab() === "regular-functions"}
          onClick={() => setCurrentTab("regular-functions")}
        >
          内建通常函数文档
        </Tab>
        <Tab
          isActive={currentTab() === "getting-started"}
          onClick={() => setCurrentTab("getting-started")}
        >
          快速上手
        </Tab>
      </Tabs>

      <ShowKeepAlive when={() => currentTab() === "regular-functions"}>
        <RegularFunctionsTab />
      </ShowKeepAlive>
      <ShowKeepAlive when={() => currentTab() === "getting-started"}>
        <div>
          见<a href={gettingStartUrl} class="blue-link">
            此
          </a>。
        </div>
      </ShowKeepAlive>
    </Card>
  );
};

const RegularFunctionsTab: Component = () => {
  const [currentTab, setCurrentTab] = createSignal<number>(0);

  const selectableScopes = scopes;
  const selectedScope = () => selectableScopes[currentTab()]!;
  const groupSetInSelectedScope = createMemo(() =>
    Object
      .values(selectedScope().documentation.functions)
      .flatMap((doc) => doc.groups)
      .reduce((acc, group) => acc.add(group), new Set<string>())
  );
  const availableGroups = createMemo(
    () => [...groupSetInSelectedScope().values()],
  );
  // 初始化时的作用域是 “全部” 作用域，于其中的分组也便是全部的分组
  const allGroups = availableGroups();

  const [enabledGroups, setEnabledGroups] = createStore(
    Object.fromEntries(allGroups.map((g) => [g, true])),
  );
  const areAllAvailableGroupsSelected = createMemo(
    () => availableGroups().every((g) => enabledGroups[g]),
  );
  function setAllAvailableGroupStatus(asSelected: boolean) {
    for (const g of availableGroups()) {
      setEnabledGroups(g, asSelected);
    }
  }

  const [nameFilterText, setNameFilterText] = createSignal("");
  const nameFilter = createMemo((): { lowerName: string; arity?: number } => {
    const lowerName = nameFilterText().toLowerCase();
    const i = lowerName.lastIndexOf("/");
    if (i < 0) return { lowerName };
    const arityText = lowerName.slice(i + 1);
    if (arityText.length === 0) return { lowerName: lowerName.slice(0, i) };
    if (!/^\d+$/.test(arityText)) return { lowerName };
    return { lowerName: lowerName.slice(0, i), arity: parseInt(arityText) };
  });
  const filteredFnDocs = createMemo((): RegularFunctionDocumentation[] => {
    let filtered = selectedScope().documentation.functions
      .filter((doc) => {
        return doc.groups.some((group) => enabledGroups[group]);
      });

    const nameFilter_ = nameFilter();
    if (nameFilter_.arity !== undefined) {
      filtered = filtered.filter((decl) =>
        decl.parameters.length === nameFilter_.arity
      );
    }
    if (nameFilter_.lowerName) {
      filtered = filtered.reduce((acc, doc) => {
        const scores = [doc.name, ...(doc.aliases ?? [])].map((name) => {
          const i = name.toLowerCase().indexOf(nameFilter_.lowerName);
          if (i < 0) return -1;
          if (i === 0) return 2;
          if (name[i]!.toLowerCase() !== name[i]) return 1;
          return 0;
        });
        const maxScore = Math.max(...scores);
        if (maxScore < 0) return acc;
        return [...acc, { score: maxScore, doc }];
      }, [] as { score: number; doc: RegularFunctionDocumentation }[])
        .sort((a, b) =>
          a.score !== b.score
            ? b.score - a.score
            : a.doc.name.localeCompare(b.doc.name)
        )
        .map(({ doc }) => doc);
    }

    return filtered;
  });

  createEffect(on(currentTab, () => {
    const hiddenGroups = allGroups
      .filter((g) => !groupSetInSelectedScope().has(g));
    for (const g of hiddenGroups) {
      setEnabledGroups(g, true);
    }
  }));

  return (
    <div class="flex flex-col gap-4">
      <div class="inline-flex items-center gap-2 flex-wrap">
        <Join>
          <For each={selectableScopes}>
            {(scope, i) => (
              <Button
                isJoinItem={true}
                type={currentTab() === i() ? "primary" : undefined}
                onClick={() => setCurrentTab(i())}
                size="sm"
              >
                {scope.icon && scope.icon({})}
                {scope.displayName}
              </Button>
            )}
          </For>
        </Join>
        <div class="px-2">|</div>
        <For each={availableGroups()}>
          {(group) => (
            <Badge
              type={enabledGroups[group] ? "success" : "ghost"}
              size="lg"
              onClick={() => setEnabledGroups(group, !enabledGroups[group])}
            >
              {group}
            </Badge>
          )}
        </For>
        <Button
          type="neutral"
          size="sm"
          onClick={() =>
            setAllAvailableGroupStatus(!areAllAvailableGroupsSelected())}
        >
          {areAllAvailableGroupsSelected() ? "全不选" : "全选"}
        </Button>
      </div>

      <div class="inline-flex items-center gap-4">
        <Input
          class="border border-gray-500"
          placeholder="按名称/别名筛选"
          size="sm"
          setText={setNameFilterText}
        />
        <span>
          {filteredFnDocs().length}/{totalRegularFunctions}
        </span>
      </div>

      <div>
        <FunctionCardMasonry items={filteredFnDocs()} />
      </div>
    </div>
  );
};

const breakpoints = createBreakpoints({
  sm: "640px",
  two: "768px",
  three: "1152px",
  four: "1536px",
});

export const FunctionCardMasonry: Component<{
  items: RegularFunctionDocumentation[];
}> = (props) => {
  const columns = createMemo(() => {
    if (breakpoints.four) return 4;
    if (breakpoints.three) return 3;
    if (breakpoints.two) return 2;
    return 1;
  });

  const cardMemos = new Map<RegularFunctionDocumentation, HTMLElement>();
  const cards = () =>
    props.items.map((doc) => {
      const memo = cardMemos.get(doc);
      if (memo) return memo;

      const card = () => (
        <div class="p-2 max-sm:px-0">
          <FunctionCard doc={doc} />
        </div>
      );
      const cardEl = document.createElement("div");
      render(card, cardEl);

      cardMemos.set(doc, cardEl);
      return cardEl;
    });

  return <FixedMasonry source={cards} columns={columns} />;
};

export const FunctionCard: Component<{
  doc: RegularFunctionDocumentation;
}> = (props) => {
  let widgetOwnerEl!: HTMLDivElement,
    widgetAnchorEl!: HTMLDivElement;

  onMount(() => {
    registerRoWidgetOwner(widgetOwnerEl, {
      widgetAnchorElement: widgetAnchorEl,
      level: 1,
      layoutChangeObserver: //
        new ElementLayoutChangeObserver(widgetOwnerEl, { resize: true }),
    });
  });

  return (
    <Card
      ref={widgetOwnerEl}
      title={
        <div class="w-full flex items-center">
          <div class="flex-1" />
          <div class="flex-1 flex justify-center items-center gap-2">
            {props.doc.isOperator ? <VsSymbolOperator /> : <VsSymbolMethod />}
            <code>
              {props.doc.name}
              <span class="text-sm align-sub">
                /{props.doc.parameters.length}
              </span>
            </code>
          </div>
          <div class="flex-1 flex justify-end gap-2">
            <For each={props.doc.groups}>
              {(group) => <Badge type="neutral" size="lg">{group}</Badge>}
            </For>
          </div>
        </div>
      }
      class={`${WIDGET_OWNER_CLASS} bg-base-200`}
    >
      <div ref={widgetAnchorEl} class="relative z-10" />
      <div class="flex justify-center w-full font-bold">
        {props.doc.description.brief}
      </div>
      <dl>
        <Show when={props.doc.aliases}>
          {(aliases) => (
            <>
              <dt>别名</dt>
              <dd>
                <Index each={aliases()}>
                  {(alias, i) => (
                    <>
                      <code>{alias()}/{props.doc.parameters.length}</code>
                      <Show when={i < aliases().length - 1}>、</Show>
                    </>
                  )}
                </Index>
              </dd>
            </>
          )}
        </Show>

        <dt>参数</dt>
        <dd>
          <dl>
            <For each={props.doc.parameters}>
              {(p, i) => (
                <>
                  <dt>
                    <code>
                      {`${i()}`}
                      <span class="text-xs">
                        {`(${p.label})`}
                      </span>
                      {": "}
                    </code>
                    <code>
                      <TypeNameBadgeList
                        typeNames={getPossibleTypeDisplayNameList(p.type)}
                      />
                    </code>
                  </dt>
                  <dd>
                    {p.description}
                  </dd>
                </>
              )}
            </For>
          </dl>
        </dd>

        <dt>返回值类型</dt>
        <dd>
          <code>
            {(() => {
              const returnValueType = props.doc.returnValue.type;
              if (typeof returnValueType === "string") {
                return (
                  <TypeNameBadgeList
                    typeNames={getPossibleTypeDisplayNameList(returnValueType)}
                  />
                );
              } else {
                return (
                  <>
                    动态{returnValueType.lazy && "（惰性）"}：
                    {returnValueType.description}
                  </>
                );
              }
            })()}
          </code>
        </dd>

        <Show when={props.doc.description.further}>
          {(further) => (
            <>
              <dt>说明</dt>
              <dd class="whitespace-pre-line">
                {further()}
              </dd>
            </>
          )}
        </Show>

        <Show when={props.doc.examples?.length}>
          <>
            <dt>示例</dt>
            <Index each={props.doc.examples!}>
              {(example) => (
                <dd>
                  <dicexp-example code={example()} />
                </dd>
              )}
            </Index>
          </>
        </Show>
      </dl>
    </Card>
  );
};

export const TypeNameBadgeList: Component<{ typeNames: string[] }> = (
  props,
) => {
  return (
    <div class="inline-flex items-center gap-2">
      <For each={props.typeNames}>
        {(name, i) => (
          <>
            {(i() !== 0) && "或"}
            <Badge outline={true}>{name}</Badge>
          </>
        )}
      </For>
    </div>
  );
};

function getPossibleTypeDisplayNameList(
  t: RegularFunctionParameterTypeSpec,
): string[] {
  if (t === "*") return ["任意"];
  if (t === "$lazy") return ["惰性（不检查）"];
  if (t instanceof Set) {
    return [...t].map(localizeValueType);
  }
  return [localizeValueType(t)];
}
