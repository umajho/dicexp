import { Node, NodeValue_Closure } from "../parsing/building_blocks.ts";
import { RuntimeError } from "./runtime_errors.ts";

export type EvaluatedValueTypes = ReturnType<typeof getTypeName>;

export function typeDisplayText(t: EvaluatedValueTypes) {
  switch (t) {
    case "number":
      return "整数";
    case "boolean":
      return "布尔";
    case "list":
      return "列表";
    case "closure":
      return "闭包";
    default:
      return `？（${t}）`;
      // throw new Unreachable();
  }
}

export interface EvaluatedValue {
  value:
    | number
    | boolean
    | EvaluatedValue[]
    | NodeValue_Closure
    | Lazy
    | RuntimeError
    | null; // null 代表未被 eval。（比如之前的哪个值出错了时。）

  /** 当前步骤 */
  step: Step;
}

export type Step = (string | Step)[];

export function evaluatedValue(
  value: EvaluatedValue["value"],
  step: Step,
): EvaluatedValue {
  return {
    value,
    step,
  };
}

export function getTypeName(v: EvaluatedValue) {
  switch (typeof v.value) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      if (Array.isArray(v.value)) return "list";
      if (v.value === null) return "unevaluated";
      if (v.value instanceof RuntimeError) return "errored";
      return v.value.valueKind;
  }
}

/**
 * 确保 `|>` 的功能。
 */
export interface Lazy {
  valueKind: "lazy";

  pipeable: boolean;

  invoke: (args: Node[]) => EvaluatedValue;

  args: Node[];
}

export function asLazy(v: EvaluatedValue): Lazy | null {
  if (
    typeof v.value === "object" && v.value !== null &&
    !Array.isArray(v.value) && !(v.value instanceof RuntimeError) &&
    v.value.valueKind === "lazy"
  ) {
    return v.value;
  }
  return null;
}

/**
 * 如果是导致错误的地方，则 `step` 应为 null；
 * 如果是是传播过程中，应该自定义 `step` 包装错误。
 *
 * @param error
 * @param step
 * @returns
 */
export function errored(
  error: RuntimeError,
  step: Step | null = null,
): EvaluatedValue {
  return evaluatedValue(error, step ?? [`【${error.message}】`]);
}

export function isErrored(v: EvaluatedValue) {
  return v.value instanceof RuntimeError;
}

export function unevaluated(): EvaluatedValue {
  return evaluatedValue(null, ["_"]);
}
