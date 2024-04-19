import { RuntimeError } from "../runtime-errors/mod";
import {
  SequenceFragment,
  Value,
  Value_List,
  Value_Sequence,
  Value_Sequence$Sum,
} from "../values/mod";
import { ValueBox } from "../value-boxes/mod";
import { ReprInRuntime } from "./repr-in-runtime";

import type * as I from "@dicexp/interface";

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
    if (typeof value === "number" || typeof value === "boolean") {
      return createRepr.value_primitive(value);
    } else if (value.type === "list") {
      return createRepr.value_list(value);
    } else if (value.type === "sequence") {
      return createRepr.value_sequence(value);
    } else if (value.type === "sequence$sum") {
      return createRepr.value_sequence$sum(value);
    } else {
      value.type satisfies "callable";
      return value.representation;
    }
  },

  /**
   * 如：`42`。
   */
  value_primitive(
    value: number | boolean,
  ): ReprInRuntime & { 0: "vp" } {
    return ["vp", value];
  },

  /**
   * 如：`[ 1, 2, 3 ]`。
   */
  value_list(
    list: Value_List,
  ): ReprInRuntime & { 0: "vl@" } {
    return [
      "vl@",
      () => list.map((item) => item.getRepr()),
      () => list.errorBeacon.comfirmsError(),
    ];
  },

  /**
   * 如：`[ 1, 2, 3 ⟨, 4, 5, 6⟩ ]`。
   */
  value_sequence(seq: Value_Sequence): ReprInRuntime & { 0: "vl@" } {
    const mapCb: (f: SequenceFragment<ValueBox>) => ReprInRuntime[] = //
      ([[itemType, item], abandoned]) => {
        let itemRepr: ReprInRuntime = item.getRepr();
        if (itemType !== "regular") {
          itemRepr = createRepr.decoration(itemType, itemRepr);
        }
        const createAbandonedRepr = (item: ValueBox) =>
          createRepr.decoration("🗑️", item.getRepr());
        return [
          ...(abandoned ? abandoned.map(createAbandonedRepr) : []),
          itemRepr,
        ];
      };
    return [
      "vl@",
      () => seq.nominalFragments.flatMap(mapCb),
      () => seq.errorBeacon?.comfirmsError() ?? false,
      () => seq.surplusFragments?.flatMap(mapCb),
    ];
  },

  /**
   * 如：`(1 + 2 + 3 ⟨+ 4 + 5 + 6⟩ = 6)`。
   */
  value_sequence$sum(seq: Value_Sequence$Sum): ReprInRuntime & { 0: "vs@" } {
    const mapCb: (f: SequenceFragment<number>) => ReprInRuntime[] = //
      ([[itemType, item], abandoned]) => {
        let itemRepr: ReprInRuntime = createRepr.value_primitive(item);
        if (itemType !== "regular") {
          itemRepr = createRepr.decoration(itemType, itemRepr);
        }
        const createAbandonedRepr = (item: number) =>
          createRepr.decoration("🗑️", createRepr.value_primitive(item));
        return [
          ...(abandoned ? abandoned.map(createAbandonedRepr) : []),
          itemRepr,
        ];
      };
    return [
      "vs@",
      () => seq.castImplicitly(),
      () => seq.nominalFragments.flatMap(mapCb),
      () => seq.surplusFragments?.flatMap(mapCb),
    ];
  },

  /**
   * @param value 若不存在，代表还没处理到值就遇到了错误。
   *
   * 如：`($foo = 42)`。
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
   * - 单目运算符：`d3 ⇒ 2`。
   * - 双目运算符：`3 + 7 ⇒ 10`。
   * - 通常函数调用：[^1]。
   *   - `{filter([3, 7], \($x -> $x > 5))} ⇒ [7]`。
   *   - `{filter([3, 7], \(_ -> d2 > 1))} ⇒ [7]`。
   * - 通常函数调用（管道）：`{[3, 7] |> sum} ⇒ 10`。
   *
   * 位于运算符（包括 `|>`）的一侧时需要括号包围，如：`(1 + 2 ⇒ 3) * 3`。
   * 注：相同优先级的运算符连在一起时会合并为 `c$`。
   *
   * TODO: 可以让部分函数显示中间步骤。
   *
   * TODO: 根据调用的函数 “纯” 与否切换使用 “=”/“⇒”。
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
   * - 闭包调用：`{\($x -> -$x).(42)} ⇒ -42`。
   * - 闭包调用（管道）：`{[3, 7] |> $sum.()} ⇒ 10`。
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
   * 如：`1 + 2 + 3 - 4 ⇒ 2` 而非 `((1+2 -> 3) + 3 -> 6) - 4 -> 2`。
   *
   * 自身之外，位于运算符（包括 `|>`）的一侧时需要括号包围，如：`(1 + 2 + 3 = 6) * 3`。
   */
  calls_ord_bin_op(
    head: I.Repr,
    tail: [callee: string, rightArg: I.Repr][],
    result?: I.Repr,
  ): I.Repr & { 0: "c$" } {
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

  decoration(
    decorationType: Extract<ReprInRuntime, { 0: "d" }>[1],
    repr: ReprInRuntime,
  ): ReprInRuntime & { 0: "d" } {
    return ["d", decorationType, repr];
  },
};
