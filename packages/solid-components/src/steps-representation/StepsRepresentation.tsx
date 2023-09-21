import { Component, Index, JSX, Show, useContext } from "solid-js";

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

  const ContentComp = createContentComponentForRepr(
    props.repr,
    props.depth,
    context.colorScheme,
  );

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
      }}
      class={`font-mono rounded`}
    >
      <ContentComp
        isExpanded={() => true}
      />
    </span>
  );
};

function createContentComponentForRepr(
  repr: Repr,
  depth: number,
  colorScheme: ColorScheme,
): Component<{
  isExpanded: () => boolean;
}> {
  switch (repr[0]) {
    case "r": {
      const raw = repr[1];
      return (props) => (
        <Show when={props.isExpanded()} fallback="…">
          {raw}
        </Show>
      );
    }
    case "_":
      return () => "_";
    case "vp": {
      const value = repr[1];
      let textColor: RGBColor | undefined = colorScheme[`value_${typeof value}`]
        ?.text;
      return () => <Colored text={textColor}>{JSON.stringify(value)}</Colored>;
    }
    case "vl": {
      const items = repr[1];
      return (props) => (
        <ListLike
          parens={["[", "]"]}
          isExpanded={props.isExpanded}
          items={items}
          depth={depth}
        />
      );
    }
    case "vs": {
      const sum = repr[1];
      return () => <>{sum}</>;
    }
    case "i": {
      const [_, name, value] = repr;
      return () => (
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
      );
    }
    case "cr": {
      const [_, style, callee, args_, result_] = repr;
      const args = args_ ?? [];
      const result = resultAsUndefinedIfIsIndirectError(result_);
      const ResultSR = result &&
        (() => <Step repr={result} depth={depth + 1} rank={args.length} />);
      switch (style) {
        case "f":
          return (props) => (
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
          );
        case "o":
          if (args.length === 1) {
            if (callee === "+" || callee === "-" && args[0][0] === "vp") {
              // TODO: 感觉不应该在这里写死，而是交由函数的执行逻辑决定是否像这样简化。
              const [_, value] = args[0];
              if (typeof value === "number") {
                return () => (
                  <>
                    <Colored {...colorScheme.opeator}>{callee}</Colored>
                    {/* <Step repr={args[0]} depth={depth + 1} rank={0} /> */}
                    <Colored {...colorScheme.value_number}>
                      {JSON.stringify(value)}
                    </Colored>
                  </>
                );
              }
            }
            return (props) => (
              <>
                {"("}
                <Colored {...colorScheme.opeator}>{callee}</Colored>
                <Show when={props.isExpanded()} fallback="…">
                  <Step repr={args[0]} depth={depth + 1} rank={0} />
                </Show>
                <ToResultIfExists Result={ResultSR} />
                {")"}
              </>
            );
          } else if (args.length === 2) {
            return (props) => (
              <>
                {"("}
                <Show when={props.isExpanded()} fallback="…">
                  <Step repr={args[0]} depth={depth + 1} rank={0} />
                </Show>
                <Colored {...colorScheme.opeator}>{` ${callee} `}</Colored>
                <Show when={props.isExpanded()} fallback="…">
                  <Step repr={args[1]} depth={depth + 1} rank={1} />
                </Show>
                <ToResultIfExists Result={ResultSR} />
                {")"}
              </>
            );
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
          }
          return (props) => (
            <>
              {"("}
              <Show when={props.isExpanded()} fallback="…">
                <Step repr={args[0]} depth={depth + 1} rank={0} />
              </Show>
              <Colored {...colorScheme.operator_special}>{" |> "}</Colored>
              <Colored {...colorScheme.regular_function}>{callee}</Colored>
              <ListLike
                parens={["(", ")"]}
                compactAroundParens={true}
                isExpanded={props.isExpanded}
                items={args.slice(1)}
                depth={depth}
                rankOffset={1}
              />
              <ToResultIfExists Result={ResultSR} />
              {")"}
            </>
          );
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
          return (props) => (
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
          );
        case "p":
          if (args.length < 1) {
            throw new Error(
              `管道风格的值作为函数的调用期待至少 1 个参数, 实际获得 ${args.length} 个`,
            );
          }
          return (props) => (
            <>
              {"("}
              <Show when={props.isExpanded()} fallback="…">
                <Step repr={args[0]} depth={depth + 1} rank={0} />
              </Show>
              <Colored {...colorScheme.operator_special}>{" |> "}</Colored>
              {"("}
              <CalleeSR />
              {")"}
              {"."}
              <ListLike
                parens={["(", ")"]}
                compactAroundParens={true}
                isExpanded={props.isExpanded}
                items={args.slice(1)}
                depth={depth}
                rankOffset={1 + 1} // 在管道左侧的参数 + callee
              />
              <ToResultIfExists Result={ResultSR} />
              {")"}
            </>
          );
      }
    }
    case "c$": {
      const [_, head, tail, result_] = repr;
      const result = resultAsUndefinedIfIsIndirectError(result_);
      const ResultSR = result &&
        (() => <Step repr={result} depth={depth + 1} rank={tail.length + 1} />);
      return (props) => (
        <>
          {"("}
          <Show when={props.isExpanded()} fallback="…">
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
      );
    }
    case "&": {
      const [_, name, arity] = repr;
      return () => (
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
      );
    }
    case "#": {
      const [_, count, body, result_] = repr;
      const result = resultAsUndefinedIfIsIndirectError(result_);
      const ResultSR = result &&
        (() => <Step repr={result} depth={depth + 1} rank={2} />);
      const bodyAsRawRepr: Repr = ["r", body];
      return (props) => (
        <>
          {"("}
          <Show when={props.isExpanded()} fallback="…">
            <Step repr={count} depth={depth + 1} rank={0} />
          </Show>
          <Colored {...colorScheme.operator_special}>{" # "}</Colored>
          <Show when={props.isExpanded()} fallback="…">
            <Step repr={bodyAsRawRepr} depth={depth + 1} rank={1} />
          </Show>
          <ToResultIfExists Result={ResultSR}></ToResultIfExists>
          {")"}
        </>
      );
    }
    case "e": {
      const [_, msg, source] = repr;
      const SourceSR = source &&
        (() => <Step repr={source} depth={depth + 1} rank={0} />);
      return () => (
        <>
          {"("}
          <FromSourceIfExists Source={SourceSR} />
          {`错误：「${msg}」！`}
          {")"}
        </>
      );
    }

    case "E":
      return () => <>（实现细节泄漏：此处是间接错误，不应展现在步骤中！）</>;
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

  return (
    <Show
      when={props.isExpanded() && props.items.length}
      fallback={props.items.length ? `${lP} … ${rP}` : `${lP}${rP}`}
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

const Colored: Component<{ text?: RGBColor; children: JSX.Element }> = (
  props,
) => {
  return (
    <span style={{ color: props.text && `rgb(${props.text.join(",")})` }}>
      {props.children}
    </span>
  );
};
