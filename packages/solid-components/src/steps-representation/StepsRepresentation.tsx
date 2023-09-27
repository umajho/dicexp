import {
  Component,
  createContext,
  createSignal,
  Index,
  JSX,
  Match,
  onMount,
  Show,
  Switch,
  useContext,
} from "solid-js";

// 这里特意强调 imort type，防止真的引入了 dicexp 包中的实质内容
import type { Repr } from "dicexp/internal";

import { RepresentationContext, RepresentationContextData } from "./context";
import { ColorScheme, RGBColor } from "./color-scheme";
import { defaultColorScheme } from "./color-scheme-default";
import { createUniqueClassMarker } from "./hooks";

const PositionContext = createContext<{ depth: number; rank: number }>();
const HoveredClassMarkerContext = createContext<
  ReturnType<typeof createUniqueClassMarker>
>();
const CanAutoExpandContext = createContext<boolean>(true);

export const StepsRepresentation: Component<
  & { repr: Repr }
  & Partial<RepresentationContextData>
> = (props) => {
  const contextData: RepresentationContextData = {
    colorScheme: defaultColorScheme,
    listPreviewLimit: 3,
    autoExpansionDepthLimit: 3,
    ...props,
  };

  const hoveredClassMarker = createUniqueClassMarker("hovered");

  return (
    <span>
      <style>{createRootStyle(contextData.colorScheme)}</style>
      <PositionContext.Provider value={{ depth: 0, rank: 0 }}>
        <RepresentationContext.Provider value={contextData}>
          <HoveredClassMarkerContext.Provider value={hoveredClassMarker}>
            <Step repr={props.repr} />
          </HoveredClassMarkerContext.Provider>
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
  outline: 2px solid rgba(255, 255, 255, 50%);
}`;

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
    repr: Repr & { 0: key },
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
    let textColor: RGBColor | undefined = colorScheme[`value_${typeof value}`]
      ?.text;
    return (props) => (
      <Slot {...props}>
        {() => <Colored text={textColor}>{JSON.stringify(value)}</Colored>}
      </Slot>
    );
  },
  "vl": (repr, { listPreviewLimit }) => {
    const items = repr[1];
    const canCollapse = items.length > listPreviewLimit;
    return (props) => (
      <Slot {...props} canCollapse={canCollapse} cannotAutoExpand={true}>
        {({ isExpanded }) => (
          <ListLike
            parens={["[", "]"]}
            padding=" "
            items={items}
            expansion={isExpanded() || listPreviewLimit}
          />
        )}
      </Slot>
    );
  },
  "vs": (repr) => {
    const sum = repr[1];
    return (props) => (
      <Slot {...props}>
        {() => <>{sum}</>}
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
          return c.regularAsUnaryOperator(callee, args[0], Result, ctx);
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
        const head = args[0], tail = args.slice(1);
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
        const head = args[0], tail = args.slice(1);
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
            <Show when={isExpanded()} fallback={<More />}>
              <DeeperStep repr={count} />
              <Colored {...colorScheme.operator_special}>{" # "}</Colored>
              <DeeperStep repr={["r", body]} rank={1} />
            </Show>
            <ToResultIfExists Result={Result}></ToResultIfExists>
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
            <Show when={isExpanded()} fallback={<More />}>
              <Colored {...colorScheme.regular_function}>{callee}</Colored>
              <ListLike parens={["(", ")"]} items={args} expansion={true} />
            </Show>
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
            <Show when={isExpanded()} fallback={<More />}>
              <Colored {...colorScheme.opeator}>{callee}</Colored>
              <DeeperStep repr={operand} />
            </Show>
            <ToResultIfExists Result={Result} />
            {")"}
          </>
        )}
      </Slot>
    );
  },
  regularAsBinaryOperator(
    callee: string,
    [operandLeft, operandRight]: [Repr, Repr],
    Result: Component | undefined,
    { colorScheme }: RepresentationContextData,
  ) {
    const canCollapse = ![operandLeft, operandRight].every(isSimpleRepr);
    return () => (
      <Slot canCollapse={canCollapse}>
        {({ isExpanded }) => (
          <>
            {"("}
            <Show when={isExpanded()} fallback={<More />}>
              <DeeperStep repr={operandLeft} />
              <Colored {...colorScheme.opeator}>{` ${callee} `}</Colored>
              <DeeperStep repr={operandRight} rank={1} />
            </Show>
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
            <Show when={isExpanded()} fallback={<More />}>
              <DeeperStep repr={headArg} />
              <Colored {...colorScheme.operator_special}>{" |> "}</Colored>
              <Colored {...colorScheme.regular_function}>{callee}</Colored>
              <ListLike
                parens={["(", ")"]}
                items={tailArgs}
                rankOffset={1}
                expansion={true}
              />
            </Show>
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
            <Show when={isExpanded()} fallback={<More />}>
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
            </Show>
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
            <Show when={isExpanded()} fallback={<More />}>
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
            </Show>
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
            <Show when={isExpanded()} fallback={<More />}>
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
            </Show>
            <ToResultIfExists Result={Result}></ToResultIfExists>
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

  items: Repr[];
  rankOffset?: number;

  /**
   * true: 完全展开；
   * number: 折叠，但是预览对应数目之项。
   */
  expansion: true | number;
}> = (props) => {
  const [lP, rP] = props.parens;
  const context = useContext(RepresentationContext)!;

  return (
    <Show
      when={true /** TODO!: 重新支持v */ && props.items.length}
      fallback={props.items.length
        ? (
          <>
            {`${lP}`}
            <Colored {...context.colorScheme.more}>{` … `}</Colored>
            {`${rP}`}
          </>
        )
        : `${lP}${rP}`}
    >
      {`${lP}`}
      {props.padding}
      <ListItems {...props} />
      {props.padding}
      {`${rP}`}
    </Show>
  );
};

const ListItems: Component<{
  items: Repr[];
  rankOffset?: number;

  /**
   * 见 ListLike 组件对应属性。
   */
  expansion: true | number;
}> = (props) => {
  const rankOffset = props.rankOffset ?? 0;

  return (
    <Index each={props.items}>
      {(repr, i) => {
        return (
          <Switch>
            <Match when={props.expansion === true || i < props.expansion}>
              <DeeperStep repr={repr()} rank={rankOffset + i} />
              <Show when={i < props.items.length - 1}>{", "}</Show>
            </Match>
            <Match when={props.expansion !== true && i === props.expansion}>
              <More />
            </Match>
          </Switch>
        );
      }}
    </Index>
  );
};

const ToResultIfExists: Component<{ Result: Component | undefined }> = (
  props,
) => (
  <Show when={props.Result}>
    {(_ResultComponent) => {
      const ResultComponent = _ResultComponent();
      return (
        <>
          {" ⇒ "}
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
  if (!result || result[0] === "E") return [undefined, true];
  return [result, false];
}

const DeeperStep: Component<
  { repr: Repr; rank?: number }
> = (props) => {
  const pos = useContext(PositionContext)!;
  return (
    <PositionContext.Provider
      value={{ depth: pos.depth + 1, rank: props.rank ?? 0 }}
    >
      <Step repr={props.repr} />
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

  const hoveredClassMarker = useContext(HoveredClassMarkerContext)!;
  onMount(() => { // XXX: 不知何故，内联在 JSX 中的 OnMouseOver 不好用
    el.addEventListener("mouseover", (ev: Event) => {
      ev.stopPropagation();
      hoveredClassMarker(el, "add");
    });
    el.addEventListener("mouseleave", () => {
      hoveredClassMarker(el, "remove");
    });
  });

  return (
    <span
      ref={el}
      class={[
        "slot",
        canCollapse ? "collapsible" : "",
        isExpanded() ? "expanded" : "",
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

const More: Component = () => {
  const context = useContext(RepresentationContext)!;

  return <Colored {...context.colorScheme.more}>…</Colored>;
};

const Colored: Component<{ text?: RGBColor; children: JSX.Element }> = (
  props,
) => {
  return (
    <span style={{ color: props.text && `rgb(${props.text.join(",")})` }}>
      {props.children}
    </span>
  );
};

function isSimpleRepr(repr: Repr) {
  return repr[0] === "_" || repr[0] === "vp";
}
