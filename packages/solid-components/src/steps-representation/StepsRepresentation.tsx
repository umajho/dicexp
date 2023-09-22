import {
  Component,
  createSignal,
  Index,
  JSX,
  Show,
  useContext,
} from "solid-js";

// 这里特意强调 imort type，防止真的引入了 dicexp 包中的实质内容
import type { Repr } from "dicexp/internal";

import { RepresentationContext } from "./context";
import { ColorScheme, RGBColor } from "./color-scheme";
import { defaultColorScheme } from "./color-scheme-default";

export const StepsRepresentation: Component<{
  repr: Repr;
  colorScheme?: ColorScheme;
}> = (props) => {
  const colorScheme = props.colorScheme ?? defaultColorScheme;

  return (
    <span>
      <RepresentationContext.Provider
        value={{ colorScheme }}
      >
        <Step
          repr={props.repr}
          depth={0}
          rank={0}
        />
      </RepresentationContext.Provider>
    </span>
  );
};

const Step: Component<
  { repr: Repr; depth: number; rank: number }
> = (props) => {
  const isError = props.repr[0] === "E" || props.repr[0] === "e";
  const context = useContext(RepresentationContext)!;

  const { Component: ContentComp, isCollapsible } =
    createContentComponentForRepr(
      props.repr,
      props.depth,
      context.colorScheme,
    );

  const [isExpanded, setIsExpanded] = createSignal(!isCollapsible);

  const bgColor = (() => {
    if (isError) return context.colorScheme.error.background;
    if (props.depth === 0) return undefined;
    const csForLevels = context.colorScheme.levels;
    const csForRanks = csForLevels[(props.depth - 1) % csForLevels.length];
    return csForRanks[props.rank % csForRanks.length].background;
  })();
  const textColor = isError
    ? context.colorScheme.error.text
    : context.colorScheme.default.text;

  function toggleExpansion(ev: Event) {
    ev.stopPropagation();
    if (!isCollapsible) return;
    setIsExpanded(!isExpanded());
  }

  return (
    <span
      style={{
        "background-color": bgColor && `rgba(${bgColor.join(",")},90%)`,
        "color": `rgb(${textColor.join(",")})`,
        // TODO: 配置好 tailwind 扫描这里后，改用 tailwind
        "padding-left": "3px",
        "padding-right": "3px",
        "margin-left": "1px",
        "margin-right": "1px",
        ...(isError ? { "font-weight": "700" } : {}),
        "cursor": isCollapsible
          ? (isExpanded() ? "zoom-out" : "zoom-in")
          : "auto",
      }}
      class={`font-mono rounded`}
      onClick={toggleExpansion}
    >
      <ContentComp
        isExpanded={isExpanded}
      />
    </span>
  );
};

function createContentComponentForRepr(
  repr: Repr,
  depth: number,
  colorScheme: ColorScheme,
): {
  Component: Component<{
    isExpanded: () => boolean;
  }>;
  isCollapsible: boolean;
} {
  switch (repr[0]) {
    case "r": {
      const raw = repr[1];
      return {
        Component: () => raw,
        isCollapsible: false,
      };
    }
    case "_":
      return {
        Component: () => "_",
        isCollapsible: false,
      };
    case "vp": {
      const value = repr[1];
      let textColor: RGBColor | undefined = colorScheme[`value_${typeof value}`]
        ?.text;
      return {
        Component: () => (
          <Colored text={textColor}>{JSON.stringify(value)}</Colored>
        ),
        isCollapsible: false,
      };
    }
    case "vl": {
      const items = repr[1];
      return {
        Component: (props) => (
          <ListLike
            parens={["[", "]"]}
            isExpanded={props.isExpanded}
            items={items}
            depth={depth}
          />
        ),
        isCollapsible: items.length > 0,
      };
    }
    case "vs": {
      const sum = repr[1];
      return {
        Component: () => <>{sum}</>,
        isCollapsible: false,
      };
    }
    case "i": {
      const [_, name, value] = repr;
      return {
        Component: () => (
          <>
            {value && "("}
            <Colored {...colorScheme.identifier}>{name}</Colored>
            {value && " "}
            <Show when={value}>
              {(value) => (
                <>
                  {" = "}
                  <Step repr={value()} depth={depth + 1} rank={0} />
                </>
              )}
            </Show>
            {value && ")"}
          </>
        ),
        isCollapsible: false,
      };
    }
    case "cr": {
      const [_, style, callee, args_, result_] = repr;
      const args = args_ ?? [];
      const result = resultAsUndefinedIfIsIndirectError(result_);
      const ResultSR = result &&
        (() => <Step repr={result} depth={depth + 1} rank={args.length} />);
      switch (style) {
        case "f":
          return {
            Component: (props) => (
              <>
                <Colored {...colorScheme.regular_function}>{callee}</Colored>
                <ListLike
                  parens={["(", ")"]}
                  compactAroundParens={true}
                  isExpanded={props.isExpanded}
                  items={args}
                  depth={depth}
                />
                <ToResultIfExists Result={ResultSR} />
              </>
            ),
            isCollapsible: args.length > 0,
          };
        case "o":
          if (args.length === 1) {
            if (callee === "+" || callee === "-" && args[0][0] === "vp") {
              // TODO: 感觉不应该在这里写死，而是交由函数的执行逻辑决定是否像这样简化。
              const [_, value] = args[0];
              if (typeof value === "number") {
                return {
                  Component: () => (
                    <>
                      <Colored {...colorScheme.opeator}>{callee}</Colored>
                      {/* <Step repr={args[0]} depth={depth + 1} rank={0} /> */}
                      <Colored {...colorScheme.value_number}>
                        {JSON.stringify(value)}
                      </Colored>
                    </>
                  ),
                  isCollapsible: false,
                };
              }
            }

            const { Component: Operand, isCollapsible } = //
              createDeeperStep(args[0], { currentDepth: depth, rank: 0 });
            return {
              Component: (props) => (
                <>
                  {"("}
                  <Colored {...colorScheme.opeator}>{callee}</Colored>
                  <Operand isExpanded={props.isExpanded} />
                  <ToResultIfExists Result={ResultSR} />
                  {")"}
                </>
              ),
              isCollapsible,
            };
          } else if (args.length === 2) {
            const { Component: OperandL, isCollapsible: isCollapsibleL } =
                createDeeperStep(args[0], { currentDepth: depth, rank: 0 }),
              { Component: OperandR, isCollapsible: isCollapsibleR } =
                createDeeperStep(args[1], { currentDepth: depth, rank: 1 });
            return {
              Component: (props) => (
                <>
                  {"("}
                  <OperandL isExpanded={props.isExpanded} />
                  <Colored {...colorScheme.opeator}>{` ${callee} `}</Colored>
                  <OperandR isExpanded={props.isExpanded} />
                  <ToResultIfExists Result={ResultSR} />
                  {")"}
                </>
              ),
              isCollapsible: isCollapsibleL || isCollapsibleR,
            };
          } else {
            throw new Error(
              `运算符风格的通常函数调用期待 1 或 2 个参数, 实际获得 ${args.length} 个`,
            );
          }
        case "p":
          if (args.length < 1) {
            throw new Error(
              `管道风格的通常函数调用期待至少 1 个参数, 实际获得 ${args.length} 个`,
            );
          } else {
            const headArg = args[0], tailArgs = args.slice(1);
            const { Component: HeadArg, isCollapsible: isCollapsibleHeadArg } =
              createDeeperStep(headArg, { currentDepth: depth, rank: 0 });
            return {
              Component: (props) => (
                <>
                  {"("}
                  <HeadArg isExpanded={props.isExpanded} />
                  <Colored {...colorScheme.operator_special}>{" |> "}</Colored>
                  <Colored {...colorScheme.regular_function}>{callee}</Colored>
                  <ListLike
                    parens={["(", ")"]}
                    compactAroundParens={true}
                    isExpanded={props.isExpanded}
                    items={tailArgs}
                    depth={depth}
                    rankOffset={1}
                  />
                  <ToResultIfExists Result={ResultSR} />
                  {")"}
                </>
              ),
              isCollapsible: isCollapsibleHeadArg || (tailArgs.length > 0),
            };
          }
      }
    }
    case "cv": {
      const [_, style, callee, args_, result_] = repr;
      const args = args_ ?? [];
      const result = resultAsUndefinedIfIsIndirectError(result_);
      const CalleeSR = () => (
        <Step repr={callee} depth={depth + 1} rank={style === "f" ? 0 : 1} />
      );
      const ResultSR = result &&
        (() => <Step repr={result} depth={depth + 1} rank={args.length + 1} />);
      switch (style) {
        case "f":
          return {
            Component: (props) => (
              <>
                {"("}
                <CalleeSR />
                {")"}
                {"."}
                <ListLike
                  parens={["(", ")"]}
                  compactAroundParens={true}
                  isExpanded={props.isExpanded}
                  items={args}
                  depth={depth}
                  rankOffset={1}
                />
                <ToResultIfExists Result={ResultSR} />
              </>
            ),
            isCollapsible: args.length > 0,
          };
        case "p":
          if (args.length < 1) {
            throw new Error(
              `管道风格的值作为函数的调用期待至少 1 个参数, 实际获得 ${args.length} 个`,
            );
          } else {
            const headArg = args[0], tailArgs = args.slice(1);
            const { Component: HeadArg, isCollapsible: isCollapsibleHeadArg } =
              createDeeperStep(headArg, { currentDepth: depth, rank: 0 });
            return {
              Component: (props) => (
                <>
                  {"("}
                  <HeadArg isExpanded={props.isExpanded} />
                  <Colored {...colorScheme.operator_special}>{" |> "}</Colored>
                  {"("}
                  <CalleeSR />
                  {")"}
                  {"."}
                  <ListLike
                    parens={["(", ")"]}
                    compactAroundParens={true}
                    isExpanded={props.isExpanded}
                    items={tailArgs}
                    depth={depth}
                    rankOffset={1 + 1} // 在管道左侧的参数 + callee
                  />
                  <ToResultIfExists Result={ResultSR} />
                  {")"}
                </>
              ),
              isCollapsible: isCollapsibleHeadArg || (tailArgs.length > 0),
            };
          }
      }
    }
    case "c$": {
      const [_, head, tail, result_] = repr;
      const result = resultAsUndefinedIfIsIndirectError(result_);
      const ResultSR = result &&
        (() => <Step repr={result} depth={depth + 1} rank={tail.length + 1} />);
      return {
        Component: (props) => (
          <>
            {"("}
            <Show when={props.isExpanded()} fallback={<More />}>
              <Step repr={head} depth={depth + 1} rank={0} />
              <Index each={tail}>
                {(item, i) => {
                  const [op, repr] = item();
                  return (
                    <>
                      <Colored {...colorScheme.opeator}>{` ${op} `}</Colored>
                      <Step repr={repr} depth={depth + 1} rank={i + 1} />
                    </>
                  );
                }}
              </Index>
            </Show>
            <ToResultIfExists Result={ResultSR}></ToResultIfExists>
            {")"}
          </>
        ),
        isCollapsible: true,
      };
    }
    case "&": {
      const [_, name, arity] = repr;
      return {
        Component: () => (
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
        ),
        isCollapsible: false,
      };
    }
    case "#": {
      const [_, count, body, result_] = repr;
      const result = resultAsUndefinedIfIsIndirectError(result_);
      const ResultSR = result &&
        (() => <Step repr={result} depth={depth + 1} rank={2} />);
      const { Component: Count, isCollapsible: isCollapsible } =
        createDeeperStep(count, { currentDepth: depth, rank: 0 });
      return {
        Component: (props) => (
          <>
            {"("}
            <Count isExpanded={props.isExpanded} />
            <Colored {...colorScheme.operator_special}>{" # "}</Colored>
            <Step repr={["r", body]} depth={depth + 1} rank={1} />
            <ToResultIfExists Result={ResultSR}></ToResultIfExists>
            {")"}
          </>
        ),
        isCollapsible,
      };
    }
    case "e": {
      const [_, msg, source] = repr;
      const SourceSR = source &&
        (() => <Step repr={source} depth={depth + 1} rank={0} />);
      return {
        Component: () => (
          <>
            {"("}
            <FromSourceIfExists Source={SourceSR} />
            {`错误：「${msg}」！`}
            {")"}
          </>
        ),
        isCollapsible: false,
      };
    }

    case "E":
      return {
        Component: () => (
          <>（实现细节泄漏：此处是间接错误，不应展现在步骤中！）</>
        ),
        isCollapsible: false,
      };
  }
}

const ListLike: Component<{
  parens: [string, string];
  compactAroundParens?: boolean;
  isExpanded: () => boolean;

  items: Repr[];
  depth: number;
  rankOffset?: number;
}> = (props) => {
  const [lP, rP] = props.parens;
  const compactAroundParens = props.compactAroundParens ?? false;
  const context = useContext(RepresentationContext)!;

  return (
    <Show
      when={props.isExpanded() && props.items.length}
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
      {compactAroundParens || " "}
      <ListItems
        items={props.items}
        depth={props.depth}
        rankOffset={props.rankOffset}
      />
      {compactAroundParens || " "}
      {`${rP}`}
    </Show>
  );
};

const ListItems: Component<{
  items: Repr[];
  depth: number;
  rankOffset?: number;
}> = (props) => {
  const rankOffset = props.rankOffset ?? 0;

  return (
    <Index each={props.items}>
      {(repr, i) => {
        return (
          <>
            <Step repr={repr()} depth={props.depth + 1} rank={rankOffset + i} />
            <Show when={i < props.items.length - 1}>{", "}</Show>
          </>
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

function resultAsUndefinedIfIsIndirectError(result: Repr | undefined) {
  if (!result || result[0] === "E") return undefined;
  return result;
}

function createDeeperStep(
  repr: Repr,
  opts: { currentDepth: number; rank: number },
): {
  Component: Component<{
    isExpanded: () => boolean;
  }>;
  isCollapsible: boolean;
} {
  const t = repr[0]; // type
  if (t === "vp" || t === "_" || t === "r") {
    return {
      Component: () => (
        <Step repr={repr} depth={opts.currentDepth + 1} rank={opts.rank} />
      ),
      isCollapsible: false,
    };
  }

  return {
    Component: (props) => (
      <Show when={props.isExpanded()} fallback={<More />}>
        <Step repr={repr} depth={opts.currentDepth + 1} rank={opts.rank} />
      </Show>
    ),
    isCollapsible: true,
  };
}

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
