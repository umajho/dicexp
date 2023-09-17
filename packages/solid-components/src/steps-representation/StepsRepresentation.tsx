import { Component, Index, Show, useContext } from "solid-js";

// 这里特意强调 imort type，防止真的引入了 dicexp 包中的实质内容
import type { Repr } from "dicexp/internal";

import { ColorPalette2D, CSSColor, TextColors } from "./types";
import { RepresentationContext } from "./context";

const defaultBackgroundColorPalette2D = (
  // [
  //   ["#1e3a8a", "#14532d"], // blue-900, green-900
  //   ["#581c87", "#7c2d12"], // purple-900, orange-900
  // ]
  // [
  //   ["#172554", "#052e16"], // blue-950, green-950
  //   ["#3b0764", "#431407"], // purple-950, orange-950
  // ]
  [
    ["#312e81", "#0c4a6e"], // indigo-900 < blue > sky-900
    ["#064e3b", "#365314"], // emerald-900 < green > lime-900
    ["#701a75", "#4c1d95"], // fuchsia-900 < purple > violet-900
    ["#78350f", "#7f1d1d"], // amber-900 < orange > red-900
  ]
).map((p) => p.map((c) => `${c}EE`));

//
const defaultBackgroundColorForError = "#f87171"; // red-400
const defaultTextColors: TextColors = {
  normal: "white",
  forError: "#450a0a", // red-950
};

export const StepsRepresentation: Component<{
  repr: Repr;
  backgroundColorPalette2D?: ColorPalette2D;
  backgroundColorForError?: CSSColor;
  textColors?: TextColors;
}> = (props) => {
  const backgroundColorPalette2D = props.backgroundColorPalette2D ??
    defaultBackgroundColorPalette2D;
  const backgroundColorForError = props.backgroundColorForError ??
    defaultBackgroundColorForError;
  const textColors = props.textColors ?? defaultTextColors;

  return (
    <RepresentationContext.Provider
      value={{ backgroundColorPalette2D, textColors, backgroundColorForError }}
    >
      <Step
        repr={props.repr}
        depth={0}
        rank={0}
      />
    </RepresentationContext.Provider>
  );
};

const Step: Component<
  { repr: Repr; depth: number; rank: number }
> = (props) => {
  const isError = props.repr[0] === "E" || props.repr[0] === "e";
  const context = useContext(RepresentationContext)!;

  const ContentComp = createContentComponentForRepr(props.repr, props.depth);

  const bgColor = (() => {
    if (isError) return context.backgroundColorForError;
    if (props.depth === 0) return undefined;
    const bgColorPalette2D = context.backgroundColorPalette2D;
    const bgColorPalette =
      bgColorPalette2D[(props.depth - 1) % bgColorPalette2D.length];
    return bgColorPalette[props.rank % bgColorPalette.length];
  })();
  const textColor = context.textColors[isError ? "forError" : "normal"];

  return (
    <span
      style={{
        "background-color": bgColor,
        "color": textColor,
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

function createContentComponentForRepr(repr: Repr, depth: number): Component<{
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
      return () => <>_</>;
    case "vp": {
      const value = repr[1];
      return () => <>{JSON.stringify(value)}</>;
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
          {name}
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
              {callee}
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
            return (props) => (
              <>
                {"("}
                {callee}
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
                {` ${callee} `}
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
              {" |> "}
              {callee}
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
              {" |> "}
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
          <Show when={props.isExpanded} fallback="…">
            <Step repr={head} depth={depth + 1} rank={0} />
            <Index each={tail}>
              {(item, i) => {
                const [op, repr] = item();
                return (
                  <>
                    {` ${op} `}
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
      return () => `(&${name}/${arity})`;
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
          {" # "}
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
