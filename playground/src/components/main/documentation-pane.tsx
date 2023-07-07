import {
  Component,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { createMasonryBreakpoints, Mason } from "solid-mason";

import { VsSymbolMethod, VsSymbolOperator } from "solid-icons/vs";
import { Badge, Card, Tab, Tabs } from "../ui";
import { ShowKeepAlive } from "../utils";

import { getFunctionFullName, ScopeInfo, scopes } from "../../stores/scopes";

import {
  DeclarationParameterTypeSpec,
  RegularFunctionDeclaration,
} from "@dicexp/runtime/regular-functions";
import { getDisplayNameFromTypeName } from "@dicexp/runtime/values";

const gettingStartUrl =
  "https://github.com/umajho/dicexp/blob/main/docs/Dicexp.md";

export const DocumentationPane: Component = () => {
  const [currentTab, setCurrentTab] = createSignal<
    "regular-functions" | "getting-started"
  >("regular-functions");

  return (
    <Card
      class="w-full h-fit"
      bodyClass="p-6 gap-4"
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

  return (
    <div class="flex flex-col gap-4">
      <Tabs>
        <For each={scopes}>
          {(scope, i) => (
            <Tab
              isActive={currentTab() === i()}
              onClick={() => setCurrentTab(i())}
              size="sm"
            >
              {scope.displayName}
            </Tab>
          )}
        </For>
      </Tabs>

      <div>
        <For each={scopes}>
          {(scope, i) => (
            // NOTE: 由于使用 <ShowKeepAlive /> 会导致 <Mason /> 误将隐藏的容器的宽度
            //       视为 0，再考虑到目前没有让标签页内容维持状态的需求，因此决定使用一般的
            //       <Show />。
            <Show when={currentTab() === i()}>
              <Mason
                items={scope.declarations as RegularFunctionDeclaration[]}
                columns={breakpoints()}
              >
                {(decl) => (
                  <div class="p-2">
                    <ScopeBlock decl={decl} scope={scope} />
                  </div>
                )}
              </Mason>
            </Show>
          )}
        </For>
      </div>
    </div>
  );
};

export const ScopeBlock: Component<{
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
        <dt>参数</dt>
        <dd>
          <dl>
            <For each={props.decl.parameters}>
              {(p) => (
                <>
                  <dt>
                    <code>{p.label}:{" "}</code>
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
