import { Unimplemented } from "@dicexp/errors";

import { Value, ValueBox } from "../values";
import { RuntimeError } from "../runtime_errors";

type ReprBase<IsInRuntime extends boolean> =
  | { type: "raw"; raw: string }
  | { type: "unevaluated" }
  | { type: "value_primitive"; value: number | boolean }
  | {
    type: IsInRuntime extends true ? "value_list@rtm" : "value_list";
    items: IsInRuntime extends true //
      ? (() => ReprBase<true>)[]
      : ReprBase<false>[];
  }
  | { type: "value_sum"; sum: number }
  | { type: "identifier"; name: string; value?: ReprBase<IsInRuntime> }
  | {
    type: IsInRuntime extends true ? "call_regular@rtm" : "call_regular";
    style: "function" | "operator" | "piped";
    callee: string;
    args?: IsInRuntime extends true //
      ? (() => ReprBase<true>)[]
      : ReprBase<false>[];
    result?: ReprBase<IsInRuntime>;
  }
  | ({
    type: IsInRuntime extends true ? "call_value@rtm" : "call_value";
    style: "function" | "piped";
    callee: ReprBase<IsInRuntime>;
    args?: IsInRuntime extends true //
      ? (() => ReprBase<true>)[]
      : ReprBase<false>[];
    result?: ReprBase<IsInRuntime>;
  } & (IsInRuntime extends true ? {} : {}))
  | {
    type: "calls_ord_bin_op";
    head: ReprBase<IsInRuntime>;
    rest: [string, ReprBase<IsInRuntime>[]];
    result?: ReprBase<IsInRuntime>;
  }
  | { type: "capture"; name: string; arity: number }
  | {
    type: "repetition";
    count: ReprBase<IsInRuntime>;
    bodyRaw: string;
    result?: ReprBase<IsInRuntime>;
  }
  | {
    type: "error";
    sub_type: "direct" | "deep";
    error: RuntimeError;
    source?: ReprBase<IsInRuntime>;
  };

export type Repr = ReprBase<false>;
export type ReprInRuntime = ReprBase<true>;

export const createRepr = {
  /**
   * 如：`\($x -> -$x)`。
   *
   * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`\(_ -> 42).()`。
   */
  raw(raw: string): ReprInRuntime & { type: "raw" } {
    return { type: "raw", raw };
  },

  unevaluated(): ReprInRuntime & { type: "unevaluated" } {
    return { type: "unevaluated" };
  },

  value(value: Value): ReprInRuntime {
    if (typeof value === "number" || typeof value === "boolean") {
      return createRepr.value_primitive(value);
    } else if (Array.isArray(value)) {
      return createRepr.value_list(value);
    } else if (value.type === "list$extendable") {
      return createRepr.value_list(value._asList());
    } else if (value.type === "integer$sum_extendable") {
      return createRepr.value_sum(value._sum());
    } else {
      value.type satisfies "callable";
      return value.representation;
    }
  },

  /**
   * 如：`42`。
   *
   * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`1+1`。
   */
  value_primitive(
    value: number | boolean,
  ): ReprInRuntime & { type: "value_primitive" } {
    return { type: "value_primitive", value };
  },

  /**
   * 如：`[1, 2, 3]`。
   *
   * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`[1]++[1]`（TODO：尚未实现）。
   */
  value_list(
    items: ValueBox[],
  ): ReprInRuntime & { type: "value_list@rtm" } {
    return {
      type: "value_list@rtm",
      items: items.map((item) => () => item.getRepr()),
    };
  },

  /**
   * 如：`42`。
   *
   * TODO: 包含各个加数。（如：`1+2+3=6`。）
   */
  value_sum(sum: number): ReprInRuntime & { type: "value_sum" } {
    return { type: "value_sum", sum };
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
  ): ReprInRuntime & { type: "identifier" } {
    return { type: "identifier", name, ...(value ? { value } : {}) };
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
  ): ReprInRuntime & { type: "call_regular@rtm" } {
    return {
      type: "call_regular@rtm",
      style,
      callee,
      ...(args ? { args } : {}),
      ...(result ? { result } : {}),
    };
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
  ): ReprInRuntime & { type: "call_value@rtm" } {
    return {
      type: "call_value@rtm",
      style,
      callee,
      ...(args ? { args } : {}),
      ...(result ? { result } : {}),
    };
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
    _head: ReprInRuntime,
    _rest: [callee: string, rightArg: ReprInRuntime],
    _result?: ReprInRuntime,
  ): ReprInRuntime & { type: "calls_ord_bin_op" } {
    throw new Unimplemented();
  },

  /**
   * 如：`&+/2`。
   *
   * 位于运算符（包括 `|>`、`.`）的一侧时需要括号包围，如：`(&+/2).(1, 2)`。
   */
  capture(name: string, arity: number): ReprInRuntime & { type: "capture" } {
    return { type: "capture", name, arity };
  },

  /**
   * @param result 若不存在，代表还没得到结果就遇到了错误。
   */
  repetition(
    count: ReprInRuntime,
    bodyRaw: string,
    result?: ReprInRuntime,
  ): ReprInRuntime & { type: "repetition" } {
    return {
      type: "repetition",
      count,
      bodyRaw,
      ...(result ? { result } : {}),
    };
  },

  error(
    sub_type: "direct" | "deep",
    error: RuntimeError,
    source?: ReprInRuntime,
  ): ReprInRuntime & { type: "error" } {
    return {
      type: "error",
      sub_type,
      error,
      ...(source ? { source } : {}),
    };
  },
};

export function finalizeRepr(rtmRepr: ReprInRuntime | Repr): Repr {
  switch (rtmRepr.type) {
    case "raw":
    case "value_primitive":
    case "value_sum":
    case "capture":
      return rtmRepr;
    case "value_list@rtm":
      return {
        type: "value_list",
        items: rtmRepr.items.map((item) => finalizeRepr(item())),
      };
  }
  switch (rtmRepr.type) {
    case "identifier":
      if (rtmRepr.value) {
        // @ts-ignore
        rtmRepr.value = finalizeRepr(rtmRepr.value);
      }
      break;
    case "call_regular@rtm":
      return {
        type: "call_regular",
        style: rtmRepr.style,
        callee: rtmRepr.callee,
        ...(rtmRepr.args
          ? { args: rtmRepr.args.map((arg) => finalizeRepr(arg())) }
          : {}),
        ...(rtmRepr.result ? { result: finalizeRepr(rtmRepr.result) } : {}),
      };
    case "call_value@rtm":
      return {
        type: "call_value",
        style: rtmRepr.style,
        callee: finalizeRepr(rtmRepr.callee),
        ...(rtmRepr.args
          ? { args: rtmRepr.args.map((arg) => finalizeRepr(arg())) }
          : {}),
        ...(rtmRepr.result ? { result: finalizeRepr(rtmRepr.result) } : {}),
      };
    case "calls_ord_bin_op":
      throw new Unimplemented();
    case "repetition":
      // @ts-ignore
      rtmRepr.count = finalizeRepr(rtmRepr.count);
      if (rtmRepr.result) {
        // @ts-ignore
        rtmRepr.result = finalizeRepr(rtmRepr.result);
      }
      break;
    case "error":
      if (rtmRepr.source) {
        // @ts-ignore
        rtmRepr.source = finalizeRepr(rtmRepr.source);
      }
      break;
  }
  return rtmRepr as Repr;
}
