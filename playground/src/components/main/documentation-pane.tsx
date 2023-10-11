import {
  Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  Match,
  on,
  Show,
  Switch,
} from "solid-js";
import { createMasonryBreakpoints, Mason } from "solid-mason";

import { VsSymbolMethod, VsSymbolOperator } from "solid-icons/vs";
import { Badge, Button, Card, Input, Join, Tab, Tabs } from "../ui";
import { ShowKeepAlive } from "../utils";

import { getFunctionFullName, ScopeInfo, scopes } from "../../stores/scopes";

import {
  DeclarationParameterTypeSpec,
  RegularFunctionDeclaration,
} from "@dicexp/runtime/regular-functions";
import { getDisplayNameFromTypeName } from "@dicexp/runtime/values";
import { createStore } from "solid-js/store";

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

const breakpoints = createMasonryBreakpoints(() => [
  { query: "(min-width: 1536px)", columns: 3 }, // 2xl
  { query: "(min-width: 768px) and (max-width: 1536px)", columns: 2 }, // md
  { query: "(max-width: 768px)", columns: 1 }, // <md
]);

const RegularFunctionsTab: Component = () => {
  const [currentTab, setCurrentTab] = createSignal<number>(0);

  const fullScope: ScopeInfo = {
    displayName: "全部",
    ...scopes.reduce(
      (acc, s) => ({
        declarations: [...acc.declarations, ...s.declarations],
        documentations: { ...acc.documentations, ...s.documentations },
      }),
      { declarations: [], documentations: {} },
    ),
  };

  const selectableScopes = [fullScope, ...scopes];
  const selectedScope = () => selectableScopes[currentTab()];
  const groupSetInSelectedScope = createMemo(() =>
    Object
      .values(selectedScope().documentations)
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
  const filteredDeclarations = createMemo((): RegularFunctionDeclaration[] => {
    let filtered = selectedScope().declarations
      .filter((decl) => {
        const doc = selectedScope().documentations[getFunctionFullName(decl)];
        return doc.groups.some((group) => enabledGroups[group]);
      });

    const nameFilter_ = nameFilter();
    if (nameFilter_.arity !== undefined) {
      filtered = filtered.filter((decl) =>
        decl.parameters.length === nameFilter_.arity
      );
    }
    if (nameFilter_.lowerName) {
      filtered = filtered.reduce((acc, decl) => {
        const scores = [decl.name, ...(decl.aliases ?? [])].map((name) => {
          const i = name.toLowerCase().indexOf(nameFilter_.lowerName);
          if (i < 0) return -1;
          if (i === 0) return 2;
          if (name[i].toLowerCase() !== name[i]) return 1;
          return 0;
        });
        const maxScore = Math.max(...scores);
        if (maxScore < 0) return acc;
        return [...acc, { score: maxScore, decl }];
      }, [])
        .sort((a, b) =>
          a.score !== b.score
            ? b.score - a.score
            : a.decl.name.localeCompare(b.decl.name)
        )
        .map(({ decl }) => decl);
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
          {filteredDeclarations().length}/{fullScope.declarations.length}
        </span>
      </div>

      <div>
        <Mason items={filteredDeclarations()} columns={breakpoints()}>
          {(decl) => (
            <div class="sm:px-2 py-2">
              <FunctionCard decl={decl} scope={selectedScope()} />
            </div>
          )}
        </Mason>
      </div>
    </div>
  );
};

export const FunctionCard: Component<{
  decl: RegularFunctionDeclaration;
  scope: ScopeInfo;
}> = (props) => {
  const fullName = () => getFunctionFullName(props.decl);

  // FIXME: type
  const doc = createMemo(() => props.scope.documentations[fullName()]);
  const groups = (): string[] => doc().groups;

  const returnValueType = () => {
    return props.decl.returnValue.type;
  };

  return (
    <Card
      title={
        <div class="w-full flex items-center">
          <div class="flex-1" />
          <div class="flex-1 flex justify-center items-center gap-2">
            {doc().isOperator ? <VsSymbolOperator /> : <VsSymbolMethod />}
            <code>
              {props.decl.name}
              <span class="text-sm align-sub">
                /{props.decl.parameters.length}
              </span>
            </code>
          </div>
          <div class="flex-1 flex justify-end gap-2">
            <For each={groups()}>
              {(group) => <Badge type="neutral" size="lg">{group}</Badge>}
            </For>
          </div>
        </div>
      }
      class="bg-base-200"
    >
      <dl>
        <Show when={props.decl.aliases}>
          {(aliases) => (
            <>
              <dt>别名</dt>
              <dd>
                <Index each={aliases()}>
                  {(alias, i) => (
                    <>
                      <code>{alias()}/{props.decl.parameters.length}</code>
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
            <For each={props.decl.parameters}>
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
                  <dd>{doc().parameters[p.label]}</dd>
                </>
              )}
            </For>
          </dl>
        </dd>

        <dt>返回值类型</dt>
        <dd>
          <code>
            <Switch>
              <Match when={typeof returnValueType() === "string"}>
                <TypeNameBadgeList
                  typeNames={getPossibleTypeDisplayNameList(
                    returnValueType() as any,
                  )}
                />
              </Match>
              <Match when={true}>
                动态{(returnValueType() as any).lazy && "（惰性）"}：
                {doc().returnValue.type.description}
              </Match>
            </Switch>
          </code>
        </dd>

        <dt>描述</dt>
        <dd>{doc().description}</dd>
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
  t: DeclarationParameterTypeSpec,
): string[] {
  if (t === "*") return ["任意"];
  if (t === "$lazy") return ["惰性（不检查）"];
  if (t instanceof Set) {
    return [...t].map(getDisplayNameFromTypeName);
  }
  return [getDisplayNameFromTypeName(t)];
}
