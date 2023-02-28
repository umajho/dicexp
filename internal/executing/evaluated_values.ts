import { Unreachable } from "../../errors.ts";
import { Node } from "../parsing/building_blocks.ts";
import { RuntimeError } from "./runtime_errors.ts";

export type RuntimeValueTypes = ReturnType<typeof getTypeName>;

export function typeDisplayText(t: RuntimeValueTypes) {
  switch (t) {
    case "number":
      return "整数";
    case "boolean":
      return "布尔";
    case "list":
      return "列表";
    case "closure":
      return "闭包";
    case "captured":
      return "捕获";
    case "lazy":
    case "error":
      return `${t}（内部实现泄漏）`;
    default:
      return `？（${t}）`;
      // throw new Unreachable();
  }
}

export type RuntimeValue =
  | ConcreteValue
  | LazyValue
  | CallableValue
  | ErrorValue;

export interface ConcreteValue {
  kind: "concrete";
  value: number | boolean | ConcreteValue[];
  step: Step;
}

export interface LazyValue {
  kind: "lazy";
  execute: (args: Node[]) => RuntimeValue;
  args: Node[];
  /**
   * 是否不能修改 args。
   */
  frozen: boolean;
}

export interface CallableValue {
  kind: "callable";
  callableKind: "closure" | "captured";
  call: (args: Node[]) => RuntimeValue;
  forceArity: number;
}

export interface ErrorValue {
  kind: "error";
  error: RuntimeError;
  step: Step;
}

export type Step = (string | Step)[];

export function getTypeName(v: RuntimeValue) {
  switch (v.kind) {
    case "concrete":
      switch (typeof v.value) {
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        default:
          if (Array.isArray(v.value)) return "list";
          throw new Unreachable();
      }
    case "lazy":
      return "lazy";
    case "callable":
      switch (v.callableKind) {
        case "closure":
          return "closure";
        case "captured":
          return "captured";
        default:
          throw new Unreachable();
      }
    case "error":
      return "error";
    default:
      throw new Unreachable();
  }
}

export function concreteValue(
  value: ConcreteValue["value"],
  step: Step,
): ConcreteValue {
  return {
    kind: "concrete",
    value,
    step,
  };
}

export function lazyValue(
  fn: LazyValue["execute"],
  args: LazyValue["args"],
  isFrozen: boolean,
): LazyValue {
  return {
    kind: "lazy",
    execute: fn,
    args,
    frozen: isFrozen,
  };
}

export function asLazy(v: RuntimeValue): LazyValue | null {
  if (v.kind === "lazy") return v;
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
export function errorValue(
  error: RuntimeError,
  step: Step | null = null,
): ErrorValue {
  return {
    kind: "error",
    error,
    step: step ?? [`【${error.message}】`],
  };
}
