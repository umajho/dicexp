import { precedenceTable } from "@dicexp/lezer";

import { asPlain, Value, ValueBox } from "../values";
import { RuntimeError } from "../runtime_errors";

type ReprBase<IsInRuntime extends boolean> =
  | [type: /** raw */ "r", raw: string]
  | [type: /** unevaluated */ "_"]
  | [type: /** value_primitive */ "vp", value: number | boolean]
  | (IsInRuntime extends true /** type 中有后缀 `@` 代表是运行时版本，下同 */
    ? [type: "vl@", items: (() => ReprBase<true>)[]]
    : [type: /** value_list */ "vl", items: ReprBase<false>[]])
  | [type: /** value_sum */ "vs", sum: number]
  | [
    type: "i", /** identifier */
    name: string,
    value: ReprBase<IsInRuntime> | undefined,
  ]
  | [
    type: IsInRuntime extends true ? "cr@" : "cr", /** call_regular */
    style: "f" | "o" | "p", /** function | operator | piped */
    callee: string,
    args:
      | (IsInRuntime extends true //
        ? (() => ReprBase<true>)[]
        : ReprBase<false>[])
      | undefined,
    result: ReprBase<IsInRuntime> | undefined,
  ]
  | [
    type: IsInRuntime extends true ? "cv@" : "cv", /** call_value */
    style: "f" | "p", /** function | piped */
    callee: ReprBase<IsInRuntime>,
    args:
      | (IsInRuntime extends true //
        ? (() => ReprBase<true>)[]
        : ReprBase<false>[])
      | undefined,
    result: ReprBase<IsInRuntime> | undefined,
  ]
  | (IsInRuntime extends true ? never : [
    type: "c$", /** calls_of_operators_with_same_precedence */
    head: ReprBase<false>,
    tail: [string, ReprBase<false>][],
    result: ReprBase<false> | undefined,
  ])
  | [type: /** capture */ "&", name: string, arity: number]
  | [
    type: /** repetition */ "#",
    count: ReprBase<IsInRuntime>,
    body: string,
    result: ReprBase<IsInRuntime> | undefined,
  ]
  | [
    type: "e", /** error */
    errorMessage: string,
    source: ReprBase<IsInRuntime> | undefined,
  ]
  | [type: /** error_indirect */ "E"];

export type Repr = ReprBase<false>;
export type ReprInRuntime = ReprBase<true>;

const unevaluated: ["_"] = ["_"];

export const createRepr = {
  /**
   * 如：`\($x -> -$x)`。
   *
   * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`\(_ -> 42).()`。
   */
  raw(raw: string): ReprInRuntime & { 0: "r" } {
    return ["r", raw];
  },

  unevaluated(): ReprInRuntime & { 0: "_" } {
    return unevaluated;
  },

  value(value: Value): ReprInRuntime {
    const plainValue = asPlain(value);

    if (typeof plainValue === "number" || typeof plainValue === "boolean") {
      return createRepr.value_primitive(plainValue);
    } else if (plainValue.type === "list") {
      return createRepr.value_list(plainValue);
    } else {
      plainValue.type satisfies "callable";
      return plainValue.representation;
    }
  },

  /**
   * 如：`42`。
   *
   * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`1+1`。
   */
  value_primitive(
    value: number | boolean,
  ): ReprInRuntime & { 0: "vp" } {
    return ["vp", value];
  },

  /**
   * 如：`[1, 2, 3]`。
   *
   * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`[1]++[1]`（TODO：尚未实现）。
   */
  value_list(
    items: ValueBox[],
  ): ReprInRuntime & { 0: "vl@" } {
    return ["vl@", items.map((item) => () => item.getRepr())];
  },

  /**
   * 如：`42`。
   *
   * TODO: 包含各个加数。（如：`1+2+3=6`。）
   */
  value_sum(sum: number): ReprInRuntime & { 0: "vs" } {
    return ["vs", sum];
  },

  /**
   * @param value 若不存在，代表还没处理到值就遇到了错误。
   *
   * 如：`$foo=42`。
   *
   * 位于运算符（包括 `|>`）的一侧时需要括号包围，如：`($foo=42) + 1`。
   */
  identifier(
    name: string,
    value?: ReprInRuntime,
  ): ReprInRuntime & { 0: "i" } {
    return ["i", name, value];
  },

  /**
   * @param args 若不存在，代表还没处理到参数就遇到了错误。
   * @param result 若不存在，代表还没得到结果就遇到了错误。
   *
   * 如（示例中大括号代表可折叠部分）：
   * - 字面单目运算符：`+3`、`-3`。
   * - 单目运算符：`{d3 -> }2`。
   * - 双目运算符：`{3+7 = }10`、`{3d7 -> }20`。
   * - 通常函数调用：[^1]。
   *   - `{filter([3, 7], \($x -> $x > 5)) = }[7]`。
   *   - `{filter([3, 7], \(_ -> d2 > 1)) -> }[7]`。
   * - 通常函数调用（管道）：`{[3, 7] |> sum -> }10`。
   *
   * [^1]: TODO: 可以让部分函数显示中间步骤。
   *
   * 位于运算符（包括 `|>`）的一侧时需要括号包围，如：`(1+2 = 3) * 3`。
   * 注：相同优先级的运算符连在一起时会合并为 `ReprGroupedOperatorCalls`。
   */
  call_regular(
    style: "function" | "operator" | "piped",
    callee: string,
    args?: (() => ReprInRuntime)[],
    result?: ReprInRuntime,
  ): ReprInRuntime & { 0: "cr@" } {
    return ["cr@", style[0] as "f" | "o" | "p", callee, args, result];
  },

  /**
   * @param args 若不存在，代表还没处理到参数就遇到了错误。
   * @param result 若不存在，代表还没得到结果就遇到了错误。
   *
   * 如（示例中大括号代表可折叠部分）：
   * - 闭包调用：`{\($x -> -$x).(42) = }-42`。
   * - 闭包调用（管道）：`{[3, 7] |> $sum.() -> }10`。
   * - 捕获调用（含管道）略。
   */
  call_value(
    style: "function" | "piped",
    callee: ReprInRuntime,
    args?: (() => ReprInRuntime)[],
    result?: ReprInRuntime,
  ): ReprInRuntime & { 0: "cv@" } {
    return ["cv@", style[0] as "f" | "p", callee, args, result];
  },

  /**
   * @param result 若不存在，代表还没得到结果就遇到了错误。
   *
   * 同优先级的运算符连在一起，无需括号。
   * 如：`1+2+3-4 -> 2` 而非 `((1+2 -> 3) + 3 -> 6) - 4 -> 2`。
   *
   * 自身之外，位于运算符（包括 `|>`）的一侧时需要括号包围，如：`(1+2+3 = 6) * 3`。
   *
   * TODO: 用上。
   */
  calls_ord_bin_op(
    head: Repr,
    tail: [callee: string, rightArg: Repr][],
    result?: Repr,
  ): Repr & { 0: "c$" } {
    return ["c$", head, tail, result];
  },

  /**
   * 如：`&+/2`。
   *
   * 位于运算符（包括 `|>`、`.`）的一侧时需要括号包围，如：`(&+/2).(1, 2)`。
   */
  capture(name: string, arity: number): ReprInRuntime & { 0: "&" } {
    return ["&", name, arity];
  },

  /**
   * @param result 若不存在，代表还没得到结果就遇到了错误。
   */
  repetition(
    count: ReprInRuntime,
    bodyRaw: string,
    result?: ReprInRuntime,
  ): ReprInRuntime & { 0: "#" } {
    return ["#", count, bodyRaw, result];
  },

  error(
    error: RuntimeError,
    source?: ReprInRuntime,
  ): ReprInRuntime & { 0: "e" } {
    return ["e", error.message, source];
  },

  error_indirect(): ReprInRuntime & { 0: "E" } {
    return ["E"];
  },
};

export function finalizeRepr(rtmRepr: ReprInRuntime | Repr): Repr {
  switch (/* type */ rtmRepr[0]) {
    case "r":
    case "_":
    case "vp":
    case "vs":
    case "c$":
    case "&":
    case "E":
      return rtmRepr;
    case "vl@":
      const items = rtmRepr[1].map((item) => finalizeRepr(item()));
      return ["vl", items];
    case "i":
      if (!(/* value */ rtmRepr[2])) return rtmRepr as Repr;
      return ["i", rtmRepr[1], finalizeRepr(rtmRepr[2])];
    case "cr@":
      const args = rtmRepr[3]?.map((arg) => finalizeRepr(arg()));

      return tryCreateReprForCallGroupOfOperatorsWithSamePrecedence(
        rtmRepr,
        args,
      ) ?? [
        "cr",
        rtmRepr[1], // style
        rtmRepr[2], // callee
        args,
        rtmRepr[4] && finalizeRepr(rtmRepr[4]), // result
      ];
    case "cv@":
      return [
        "cv",
        rtmRepr[1], // style
        finalizeRepr(rtmRepr[2]), // callee
        rtmRepr[3] && rtmRepr[3].map((arg) => finalizeRepr(arg())), // args
        rtmRepr[4] && finalizeRepr(rtmRepr[4]), // result
      ];
    case "#":
      return [
        "#",
        finalizeRepr(rtmRepr[1]), // count
        rtmRepr[2], // body
        rtmRepr[3] && finalizeRepr(rtmRepr[3]), //result
      ];
    case "e":
      return [
        "e",
        rtmRepr[1], // error
        rtmRepr[2] && finalizeRepr(rtmRepr[2]), // source
      ];
  }
  return rtmRepr;
}

function tryCreateReprForCallGroupOfOperatorsWithSamePrecedence(
  repr: ReprInRuntime & { 0: "cr@" },
  args: Repr[] | undefined,
): (Repr & { 0: "c$" }) | null {
  if (/* style */ repr[1] !== "o" || args?.length !== 2) return null;

  const lArg = args[0]; // left argument
  const curCallee = repr[2];
  const curPrec: number | undefined = precedenceTable[`${curCallee}/2`];

  if (lArg[0] === "cr") {
    const lArgArgs = lArg[3];
    if (lArgArgs?.length !== 2) return null;

    const lCallee = lArg[2];
    const lPrec: number | undefined = precedenceTable[`${lCallee}/2`];
    if (lPrec !== curPrec) return null;

    return createRepr.calls_ord_bin_op(
      lArgArgs[0],
      [[lCallee, lArgArgs[1]], [curCallee, args[1]]],
      (/* result */ repr[4]) && finalizeRepr(repr[4]),
    );
  } else if (lArg[0] === "c$") {
    const lTail = lArg[2];
    const lCallee = lTail[0][0];
    const lPrec: number | undefined = precedenceTable[`${lCallee}/2`];
    if (lPrec !== curPrec) return null;

    lTail.push([curCallee, args[1]]);
    lArg[3] = (/* result */ repr[4]) && finalizeRepr(repr[4]);

    return lArg;
  }

  return null;
}
