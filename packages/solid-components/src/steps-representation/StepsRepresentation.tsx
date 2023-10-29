import {
  Component,
  createContext,
  createEffect,
  createSignal,
  Index,
  JSX,
  Match,
  on,
  onMount,
  Show,
  Switch,
  useContext,
} from "solid-js";
import {
  HiSolidArrowPath,
  HiSolidBolt,
  HiSolidSparkles,
  HiSolidTrash,
} from "solid-icons/hi";

// 这里特意强调 imort type，防止真的引入了 dicexp 包中的实质内容
import type { Repr } from "dicexp/internal";

import { RepresentationContext, RepresentationContextData } from "./context";
import { ColorScheme, RGBColor } from "./color-scheme";
import { defaultColorScheme } from "./color-scheme-default";
import { createUniqueTrueSetter } from "./hooks";
import { ShowKeepAlive } from "./util-components";

const PositionContext = createContext<{ depth: number; rank: number }>();
const UniqueHoveredSetterContext = createContext<
  ReturnType<typeof createUniqueTrueSetter>
>();
const CanAutoExpandContext = createContext<boolean>(true);
const ListItemsContext = createContext<
  | { setIsSelfHovered: (v: boolean) => void; isSiblingHovered: () => boolean }
  | null
>(null);

export type Properties =
  & { repr: Repr }
  & Partial<RepresentationContextData>;

export const StepsRepresentation: Component<Properties> = (props) => {
  const contextData: RepresentationContextData = {
    colorScheme: defaultColorScheme,
    listPreviewLimit: 3,
    sumPreviewLimit: 10,
    autoExpansionDepthLimit: 3,
    ...props,
  };

  const uniqueHoveredSetter = createUniqueTrueSetter();

  return (
    <span>
      <style>{createRootStyle(contextData.colorScheme)}</style>
      <PositionContext.Provider value={{ depth: 0, rank: 0 }}>
        <RepresentationContext.Provider value={contextData}>
          <UniqueHoveredSetterContext.Provider value={uniqueHoveredSetter}>
            <Step repr={props.repr} />
          </UniqueHoveredSetterContext.Provider>
        </RepresentationContext.Provider>
      </PositionContext.Provider>
    </span>
  );
};

function createRootStyle(colorScheme: ColorScheme) {
  // `px-[3px] mx-[1px] rounded`。
  // TODO: 让 `font-family` 的值贴近 tailwind 提供的？
  const stylesForSlotBase = `.slot {
padding-left: 3px;
padding-right: 3px;
margin-left: 1px;
margin-right: 1px;

border-radius: 0.25rem;

font-family: monospace;

color: rgb(${colorScheme.default.text.join(",")});
}

.slot:not(.collapsible) { cursor: auto; }
.slot.collapsible { cursor: zoom-in; }
.slot.collapsible.expanded { cursor: zoom-out; }

.slot.hovered {
  outline: 2px solid rgba(255, 255, 255, calc(2/3));
}
.slot.sibling-hovered {
  outline: 1.5px solid rgba(255, 255, 255, calc(1/3));
}
`;

  const stylesForSlotByPosition = //
    colorScheme.levels.map((csForLevel, level) =>
      csForLevel.map((csForRank, rank) => {
        const bgRGB = csForRank.background.join(",");
        return [
          `.slot.level-${level}.rank-${rank} { background-color: rgba(${bgRGB},90%); }`,
          `.slot.hovered.level-${level}.rank-${rank} { background-color: rgb(${bgRGB}); }`,
        ].join("\n");
      }).join("\n")
    ).join("\n");

  const stylesForSlotWithError = (() => {
    const textColor = `rgb(${colorScheme.error.text.join(",")})`;
    const bgRGB = colorScheme.error.background.join(",");
    return [
      `.slot.with-error { color: ${textColor} !important; background-color: rgba(${bgRGB},90%) !important; }`,
      `.slot.hovered.with-error { background-color: rgb(${bgRGB}) !important; }`,
    ].join("");
  })();

  return [
    stylesForSlotBase,
    stylesForSlotByPosition,
    stylesForSlotWithError,
  ].join("\n");
}

const Step: Component<{ repr: Repr }> = (props) => {
  const context = useContext(RepresentationContext)!;

  const ContentComp = createContentComponentForRepr(props.repr, context);

  return <ContentComp />;
};

type ContentComponent = Component<{}>;

function createContentComponentForRepr(
  repr: Repr,
  ctx: RepresentationContextData,
): ContentComponent {
  // @ts-ignore ts(2590)
  //   Expression produces a union type that is too complex to represent.
  return createContentComponent[repr[0]](repr, ctx);
}

const createContentComponent: {
  [key in Repr[0]]: (
    repr: Extract<Repr, { 0: key }>,
    ctx: RepresentationContextData,
  ) => ContentComponent;
} = {
  "r": (repr) => {
    const raw = repr[1];
    return (props) => (
      <Slot {...props}>
        {() => raw}
      </Slot>
    );
  },
  "_": () => (props) => (
    <Slot {...props}>
      {() => "_"}
    </Slot>
  ),
  "vp": (repr, { colorScheme }) => {
    const value = repr[1];
    const t = typeof value as "number" | "boolean";
    let textColor: RGBColor | undefined = colorScheme[`value_${t}`]?.text;
    return (props) => (
      <Slot {...props}>
        {() => <Colored text={textColor}>{JSON.stringify(value)}</Colored>}
      </Slot>
    );
  },
  "vl": (repr, { listPreviewLimit }) => {
    const [_, items, containsError, surplusItems] = repr;
    const canCollapse = items.length > listPreviewLimit;
    return (props) => (
      <Slot {...props} canCollapse={canCollapse} cannotAutoExpand={true}>
        {({ isExpanded }) => (
          <ListLike
            parens={["[", "]"]}
            padding=" "
            isRealList={true}
            items={items}
            surplusItems={surplusItems}
            expansion={isExpanded() || listPreviewLimit}
            containsError={containsError}
          />
        )}
      </Slot>
    );
  },
  "vs": (repr) => {
    const context = useContext(RepresentationContext)!;
    const [_, sum, addends, surplusAddends] = repr;
    const canCollapse = addends.length > context.sumPreviewLimit;

    if (addends.length === 1) {
      return createContentComponentForRepr(addends[0]!, context);
    }

    return (props) => (
      <Slot {...props} canCollapse={canCollapse} cannotAutoExpand={true}>
        {({ isExpanded }) => (
          <>
            {"("}
            <Items
              items={addends}
              surplusItems={surplusAddends}
              expansion={isExpanded() || context.sumPreviewLimit}
              Deeper={({ item, i }) => <DeeperStep repr={item} rank={i} />}
              separator={
                <Colored {...context.colorScheme.opeator}>
                  {" + "}
                </Colored>
              }
            />
            <ToResultIfExists
              Result={() => (
                <Colored {...context.colorScheme.value_number}>{sum}</Colored>
              )}
              symbol="="
            />
            {")"}
          </>
        )}
      </Slot>
    );
  },
  "i": (repr, { colorScheme }) => {
    // @ts-ignore ts(2488)
    const [_, name, value] = repr;
    return (props) => (
      <Slot {...props}>
        {() => (
          <>
            {value && "("}
            <Colored {...colorScheme.identifier}>{name}</Colored>
            {value && " "}
            <Show when={value}>
              {(value) => (
                <>
                  {" = "}
                  <DeeperStep repr={value()} />
                </>
              )}
            </Show>
            {value && ")"}
          </>
        )}
      </Slot>
    );
  },
  "cr": (repr, ctx) => {
    const c = createContentComponentForReprCall;

    // @ts-ignore ts(2488)
    const [_, style, callee, args_, result_] = repr;
    const args = args_ ?? [];
    const [result, _isIndirectError] = separateIndirectErrorFromResult(result_);
    const Result = result &&
      (() => <DeeperStep repr={result} rank={args.length} />);

    switch (style) {
      case "f":
        return c.regularAsFunction(callee, args, Result, ctx);
      case "o":
        if (args.length === 1) {
          return c.regularAsUnaryOperator(callee, args[0]!, Result, ctx);
        } else if (args.length === 2) {
          const operands = args as [Repr, Repr];
          return c.regularAsBinaryOperator(callee, operands, Result, ctx);
        }
        throw new Error(
          `运算符风格的通常函数调用期待 1 或 2 个参数, 实际获得 ${args.length} 个`,
        );
      case "p":
        if (args.length < 1) {
          throw new Error(
            `管道风格的通常函数调用期待至少 1 个参数, 实际获得 ${args.length} 个`,
          );
        }
        const head = args[0]!, tail = args.slice(1);
        return c.regularAsPiped(callee, head, tail, Result, ctx);
    }
  },
  "cv": (repr, ctx) => {
    const c = createContentComponentForReprCall;

    // @ts-ignore ts(2488)
    const [_, style, callee, args_, result_] = repr;
    const args = args_ ?? [];
    const [result, _isIndirectError] = separateIndirectErrorFromResult(result_);
    const rankForCallee = style === "f" ? 0 : 1;
    const Callee = () => <DeeperStep repr={callee} rank={rankForCallee} />;
    const resultRank = args.length + 1;
    const Result = result &&
      (() => <DeeperStep repr={result} rank={resultRank} />);

    switch (style) {
      case "f":
        return c.valueAsFunction(Callee, args, Result, ctx);
      case "p":
        if (args.length < 1) {
          throw new Error(
            `管道风格的值作为函数的调用期待至少 1 个参数, 实际获得 ${args.length} 个`,
          );
        }
        const head = args[0]!, tail = args.slice(1);
        return c.valueAsPiped(Callee, head, tail, Result, ctx);
    }
  },
  "c$": (repr, ctx) => {
    const c = createContentComponentForReprCall;

    // @ts-ignore ts(2488)
    const [_, head, tail, result_] = repr;
    const [result, _isIndirectError] = separateIndirectErrorFromResult(result_);
    const Result = result &&
      (() => <DeeperStep repr={result} rank={tail.length + 1} />);
    return c.groupOfRegularOperators(head, tail, Result, ctx);
  },
  "&": (repr, { colorScheme }) => {
    // @ts-ignore ts(2488)
    const [_, name, arity] = repr;
    return (props) => (
      <Slot {...props}>
        {() => (
          <>
            {"("}
            <Colored {...colorScheme.operator_special}>
              {"&"}
              <Colored {...colorScheme.regular_function}>{name}</Colored>
              {"/"}
              {arity}
            </Colored>
            {")"}
          </>
        )}
      </Slot>
    );
  },
  "#": (repr, { colorScheme }) => {
    // @ts-ignore ts(2488)
    const [_, count, body, result_] = repr;
    const [result, _isIndirectError] = separateIndirectErrorFromResult(result_);
    const Result = result && (() => <DeeperStep repr={result} rank={2} />);
    return (props) => (
      <Slot {...props} canCollapse={true}>
        {({ isExpanded }) => (
          <>
            {"("}
            <ShowKeepAlive
              when={isExpanded()}
              fallback={<More containsError={isWithError(count)} />}
            >
              <DeeperStep repr={count} />
              <Colored {...colorScheme.operator_special}>{" # "}</Colored>
              <DeeperStep repr={["r", body]} rank={1} />
            </ShowKeepAlive>
            <ToResultIfExists Result={Result} />
            {")"}
          </>
        )}
      </Slot>
    );
  },
  "e": (repr) => {
    // @ts-ignore ts(2488)
    const [_, msg, source] = repr;
    const Source = source && (() => <DeeperStep repr={source} />);
    return (props) => (
      <Slot {...props} isError={true}>
        {() => (
          <>
            {"("}
            <FromSourceIfExists Source={Source} />
            {`错误：「${msg}」！`}
            {")"}
          </>
        )}
      </Slot>
    );
  },
  "E": () => () => <>（实现细节泄漏：此处是间接错误，不应展现在步骤中！）</>,
  "d": (repr) => {
    const [_, decorationType, innerRepr] = repr;
    return (props) => (
      <Slot {...props}>
        {() => (
          <>
            <span
              style={{
                display: "inline-flex",
                height: "16px",
                "vertical-align": "bottom",
                "align-items": "center",
              }}
            >
              <Switch>
                <Match when={decorationType === "🗑️"}>
                  <HiSolidTrash />
                </Match>
                <Match when={decorationType === "🔄"}>
                  <HiSolidArrowPath />
                </Match>
                <Match when={decorationType === "⚡️"}>
                  <HiSolidBolt />
                </Match>
                <Match when={decorationType === "✨"}>
                  <HiSolidSparkles />
                </Match>
              </Switch>
            </span>
            <span
              style={{
                "filter": decorationType === "🗑️"
                  ? "sepia(1) opacity(50%)"
                  : undefined,
              }}
            >
              <Step repr={innerRepr} />
            </span>
          </>
        )}
      </Slot>
    );
  },
};

const createContentComponentForReprCall = {
  regularAsFunction(
    callee: string,
    args: Repr[],
    Result: Component | undefined,
    { colorScheme }: RepresentationContextData,
  ) {
    return () => (
      <Slot canCollapse={true}>
        {({ isExpanded }) => (
          <>
            <ShowKeepAlive
              when={isExpanded()}
              fallback={
                <More containsError={args.some((arg) => isWithError(arg))} />
              }
            >
              <Colored {...colorScheme.regular_function}>{callee}</Colored>
              <ListLike parens={["(", ")"]} items={args} expansion={true} />
            </ShowKeepAlive>
            <ToResultIfExists Result={Result} />
          </>
        )}
      </Slot>
    );
  },
  regularAsUnaryOperator(
    callee: string,
    operand: Repr,
    Result: Component | undefined,
    { colorScheme }: RepresentationContextData,
  ) {
    if (callee === "+" || callee === "-" && operand[0] === "vp") {
      // TODO: 感觉不应该在这里写死，而是交由函数的执行逻辑决定是否像这样简化。
      const [_, value] = operand;
      if (typeof value === "number") {
        return () => (
          <Slot>
            {() => (
              <>
                <Colored {...colorScheme.opeator}>{callee}</Colored>
                <Colored {...colorScheme.value_number}>
                  {JSON.stringify(value)}
                </Colored>
              </>
            )}
          </Slot>
        );
      }
    }

    const canCollapse = !isSimpleRepr(operand);
    return () => (
      <Slot canCollapse={canCollapse}>
        {({ isExpanded }) => (
          <>
            {"("}
            <Colored {...colorScheme.opeator}>{callee}</Colored>
            <ShowKeepAlive
              when={isExpanded()}
              fallback={<More containsError={isWithError(operand)} />}
            >
              <DeeperStep repr={operand} />
            </ShowKeepAlive>
            <ToResultIfExists Result={Result} />
            {")"}
          </>
        )}
      </Slot>
    );
  },
  regularAsBinaryOperator(
    callee: string,
    operands: [Repr, Repr],
    Result: Component | undefined,
    { colorScheme }: RepresentationContextData,
  ) {
    const canCollapse = !operands.every(isSimpleRepr);
    const [operandLeft, operandRight] = operands;
    return () => (
      <Slot canCollapse={canCollapse}>
        {({ isExpanded }) => (
          <>
            {"("}
            <ShowKeepAlive
              when={isExpanded()}
              fallback={
                <More containsError={operands.some((op) => isWithError(op))} />
              }
            >
              <DeeperStep repr={operandLeft} />
              <Colored {...colorScheme.opeator}>{` ${callee} `}</Colored>
              <DeeperStep repr={operandRight} rank={1} />
            </ShowKeepAlive>
            <ToResultIfExists Result={Result} />
            {")"}
          </>
        )}
      </Slot>
    );
  },
  regularAsPiped(
    callee: string,
    headArg: Repr,
    tailArgs: Repr[],
    Result: Component | undefined,
    { colorScheme }: RepresentationContextData,
  ) {
    return () => (
      <Slot canCollapse={true}>
        {({ isExpanded }) => (
          <>
            {"("}
            <ShowKeepAlive
              when={isExpanded()}
              fallback={
                <More
                  containsError={isWithError(headArg) ||
                    tailArgs.some((arg) => isWithError(arg))}
                />
              }
            >
              <DeeperStep repr={headArg} />
              <Colored {...colorScheme.operator_special}>{" |> "}</Colored>
              <Colored {...colorScheme.regular_function}>{callee}</Colored>
              <ListLike
                parens={["(", ")"]}
                items={tailArgs}
                rankOffset={1}
                expansion={true}
              />
            </ShowKeepAlive>
            <ToResultIfExists Result={Result} />
            {")"}
          </>
        )}
      </Slot>
    );
  },

  valueAsFunction(
    Callee: Component,
    args: Repr[],
    Result: Component | undefined,
    _: RepresentationContextData,
  ) {
    return () => (
      <Slot canCollapse={true}>
        {({ isExpanded }) => (
          <>
            {"("}
            <ShowKeepAlive
              when={isExpanded()}
              fallback={
                <More containsError={args.some((arg) => isWithError(arg))} />
              }
            >
              {"("}
              <Callee />
              {")"}
              {"."}
              <ListLike
                parens={["(", ")"]}
                items={args}
                rankOffset={1}
                expansion={true}
              />
            </ShowKeepAlive>
            <ToResultIfExists Result={Result} />
            {")"}
          </>
        )}
      </Slot>
    );
  },
  valueAsPiped(
    Callee: Component,
    headArg: Repr,
    tailArgs: Repr[],
    Result: Component | undefined,
    { colorScheme }: RepresentationContextData,
  ) {
    return () => (
      <Slot canCollapse={true}>
        {({ isExpanded }) => (
          <>
            {"("}
            <ShowKeepAlive
              when={isExpanded()}
              fallback={
                <More
                  containsError={isWithError(headArg) ||
                    tailArgs.some((arg) => isWithError(arg))}
                />
              }
            >
              <DeeperStep repr={headArg} />
              <Colored {...colorScheme.operator_special}>{" |> "}</Colored>
              {"("}
              <Callee />
              {")"}
              {"."}
              <ListLike
                parens={["(", ")"]}
                items={tailArgs}
                rankOffset={1 + 1} // 在管道左侧的参数 + callee
                expansion={true}
              />
            </ShowKeepAlive>
            <ToResultIfExists Result={Result} />
            {")"}
          </>
        )}
      </Slot>
    );
  },

  groupOfRegularOperators(
    head: Repr,
    tail: [string, Repr][],
    Result: Component | undefined,
    { colorScheme }: RepresentationContextData,
  ) {
    return () => (
      <Slot canCollapse={true}>
        {({ isExpanded }) => (
          <>
            {"("}
            <ShowKeepAlive
              when={isExpanded()}
              fallback={
                <More
                  containsError={isWithError(head) ||
                    tail.some((item) => isWithError(item[1]))}
                />
              }
            >
              <DeeperStep repr={head} />
              <Index each={tail}>
                {(item, i) => {
                  const [op, repr] = item();
                  return (
                    <>
                      <Colored {...colorScheme.opeator}>{` ${op} `}</Colored>
                      <DeeperStep repr={repr} rank={i + 1} />
                    </>
                  );
                }}
              </Index>
            </ShowKeepAlive>
            <ToResultIfExists Result={Result} />
            {")"}
          </>
        )}
      </Slot>
    );
  },
};

const ListLike: Component<{
  parens: [string, string];
  padding?: string;

  isRealList?: boolean;

  items: Repr[];
  surplusItems?: Repr[];
  rankOffset?: number;

  /**
   * true: 完全展开；
   * number: 折叠，但是预览对应数目之项。
   */
  expansion: true | number;
  /**
   * 用以辅助确认折叠时被省略的项中是否存在错误。
   * （此值为真，且未被省略的项中不存在错误，则错误在被省略的项中。）
   *
   * 另，这里预设整个列表中只存在一个错误。
   * FIXME: 由于 “捕获” 没有贯彻惰性，目前是可以通过多次捕获不存在的通常函数来同时制造多个
   *        错误的。不过这不算什么严重的问题，修复优先级不大。
   */
  containsError?: boolean;
}> = (props) => {
  const [lP, rP] = props.parens;

  const [isItemHovered, setIsItemHovered] = createSignal(false);

  return (
    <>
      {`${lP}`}
      {props.padding}
      <ListItemsContext.Provider
        value={{
          setIsSelfHovered: setIsItemHovered,
          isSiblingHovered: isItemHovered,
        }}
      >
        <ListItems {...props} />
      </ListItemsContext.Provider>
      {props.padding}
      {`${rP}`}
    </>
  );
};

const ListItems: Component<{
  isRealList?: boolean;

  items: Repr[];
  surplusItems?: Repr[];
  rankOffset?: number;

  /**
   * 见 ListLike 组件对应属性。
   */
  expansion: true | number;
  containsError?: boolean;
}> = (props) => {
  const rankOffset = props.rankOffset ?? 0;

  return (
    <Items
      items={props.items}
      surplusItems={props.surplusItems}
      expansion={props.expansion}
      checkError={(items) =>
        !!props.containsError &&
        !items
          .slice(0, props.expansion as number)
          .some((item) => isWithError(item))}
      Deeper={({ item, i }) => (
        <DeeperStep
          repr={item}
          rank={rankOffset + i}
          isListItem={props.isRealList}
        />
      )}
      separator={", "}
    />
  );
};

function Items<T>(props: {
  items: T[];
  surplusItems?: T[];

  expansion: true | number;
  checkError?: (items: T[]) => boolean;

  Deeper: Component<{ item: T; i: number }>;
  separator: JSX.Element;
}) {
  const outerListItemsContent = useContext(ListItemsContext);

  return (
    <>
      <Index each={props.items}>
        {(item, i) => {
          return (
            <Switch>
              <Match when={props.expansion === true || i < props.expansion}>
                <props.Deeper item={item()} i={i} />
                <Show when={i < props.items.length - 1}>
                  {props.separator}
                </Show>
              </Match>
              <Match when={props.expansion !== true && i === props.expansion}>
                <More containsError={props.checkError?.(props.items)} />
              </Match>
            </Switch>
          );
        }}
      </Index>
      <Show when={props.surplusItems}>
        {(surplusItems) => (
          <Show when={props.expansion === true}>
            {" "}
            <Deeper>
              <Slot canCollapse={true} cannotAutoExpand={true}>
                {({ isExpanded }) => (
                  <>
                    {"⟨"}
                    {props.separator}
                    <Show when={isExpanded()} fallback={<More />}>
                      <ListItemsContext.Provider value={outerListItemsContent}>
                        <Items
                          items={surplusItems()}
                          expansion={true}
                          Deeper={props.Deeper}
                          separator={props.separator}
                        />
                      </ListItemsContext.Provider>
                    </Show>
                    {"⟩"}
                  </>
                )}
              </Slot>
            </Deeper>
          </Show>
        )}
      </Show>
    </>
  );
}

const ToResultIfExists: Component<
  { Result: Component | undefined; symbol?: string }
> = (
  props,
) => (
  <Show when={props.Result}>
    {(_ResultComponent) => {
      const ResultComponent = _ResultComponent();
      return (
        <>
          {` ${props.symbol ?? "⇒"} `}
          <ResultComponent />
        </>
      );
    }}
  </Show>
);

const FromSourceIfExists: Component<{ Source: Component | undefined }> = (
  props,
) => (
  <Show when={props.Source}>
    {(_ResultComponent) => {
      const ResultComponent = _ResultComponent();
      return (
        <>
          <ResultComponent />
          {" ⇒ "}
        </>
      );
    }}
  </Show>
);

function separateIndirectErrorFromResult(
  result: Repr | undefined,
): [result: Repr | undefined, isIndirectError: boolean] {
  if (!result) return [undefined, false];
  if (result[0] === "E") return [undefined, true];
  return [result, false];
}

const DeeperStep: Component<
  { repr: Repr; rank?: number; isListItem?: boolean }
> = (props) => {
  return (
    <Deeper {...props}>
      <Step repr={props.repr} />
    </Deeper>
  );
};

const Deeper: Component<
  { children: JSX.Element; rank?: number; isListItem?: boolean }
> = (props) => {
  const pos = useContext(PositionContext)!;
  return (
    <PositionContext.Provider
      value={{ depth: pos.depth + 1, rank: props.rank ?? 0 }}
    >
      <ListItemsContext.Provider
        value={props.isListItem ? useContext(ListItemsContext) : null}
      >
        {props.children}
      </ListItemsContext.Provider>
    </PositionContext.Provider>
  );
};

const Slot: Component<
  {
    children: Component<{ isExpanded: () => boolean }>;
    canCollapse?: boolean;
    isError?: boolean;
    cannotAutoExpand?: boolean;
  }
> = (props) => {
  const context = useContext(RepresentationContext)!;
  const pos = useContext(PositionContext)!;
  const canCollapse = !!props.canCollapse;

  let el!: HTMLSpanElement;

  const canAutoExpand = useContext(CanAutoExpandContext) &&
    !props.cannotAutoExpand;
  const [isExpanded, setIsExpanded] = createSignal((() => {
    if (!canCollapse) return true;
    if (!canAutoExpand) return false;
    return pos.depth < context.autoExpansionDepthLimit;
  })());

  function toggleExpansion(ev: Event) {
    ev.stopPropagation();
    if (!canCollapse) return;
    setIsExpanded(!isExpanded());
  }

  const [isHovered, setIsHovered] = createSignal(false);
  const uniqueHoveredSetter = useContext(UniqueHoveredSetterContext)!;
  onMount(() => { // XXX: 不知何故，内联在 JSX 中的 OnMouseOver 不好用
    el.addEventListener("mouseover", (ev: Event) => {
      ev.stopPropagation();
      uniqueHoveredSetter(setIsHovered, "setTrue");
    });
    el.addEventListener("mouseleave", () => {
      uniqueHoveredSetter(setIsHovered, "setFalse");
    });
  });

  let isSiblingHovered: (() => boolean) | null = null;
  const listItemsContext = useContext(ListItemsContext);
  if (listItemsContext) {
    isSiblingHovered = listItemsContext.isSiblingHovered;
    createEffect(on([isHovered], () => {
      listItemsContext.setIsSelfHovered(isHovered());
    }));
  }

  return (
    <span
      ref={el}
      class={[
        "slot",
        canCollapse ? "collapsible" : "",
        isExpanded() ? "expanded" : "",
        isHovered()
          ? "hovered"
          : (isSiblingHovered?.() ? "sibling-hovered" : ""),
        pos.depth
          ? `level-${(pos.depth - 1) % context.colorScheme.levels.length}`
          : "",
        `rank-${pos.rank % context.colorScheme.rankPeriod}`,
        props.isError ? "with-error" : "",
      ].join(" ")}
      onClick={toggleExpansion}
    >
      <CanAutoExpandContext.Provider value={canAutoExpand}>
        {props.children({ isExpanded })}
      </CanAutoExpandContext.Provider>
    </span>
  );
};

const More: Component<{ containsError?: boolean }> = (props) => {
  const context = useContext(RepresentationContext)!;

  return (
    <Colored
      {...(props.containsError
        ? context.colorScheme.error
        : context.colorScheme.more)}
    >
      …
    </Colored>
  );
};

const Colored: Component<
  { text?: RGBColor; background?: RGBColor; children: JSX.Element }
> = (
  props,
) => {
  return (
    <span
      style={{
        color: props.text && `rgb(${props.text.join(",")})`,
        "background-color": props.background &&
          `rgb(${props.background.join(",")})`,
      }}
    >
      {props.children}
    </span>
  );
};

function isSimpleRepr(repr: Repr) {
  return repr[0] === "_" || repr[0] === "vp";
}

function isWithError(repr: Repr): boolean {
  if (isError(repr)) return true;

  if (repr[0] === "vl") return repr[2];
  if (repr[0] === "i") return repr[2] ? isWithError(repr[2]) : false;
  if (repr[0] === "cr" || repr[0] === "cv") {
    return repr[4] ? isError(repr[4]) : false;
  }
  if (repr[0] === "c$" || repr[0] === "#") {
    return repr[3] ? isError(repr[3]) : false;
  }

  return false;
}

function isError(repr: Repr): boolean {
  return repr[0] === "e" || repr[0] === "E";
}
