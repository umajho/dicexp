import { Unreachable } from "../../errors.ts";
import { FunctionCallStyle, Node } from "../parsing/building_blocks.ts";
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
    case "callable": // FIXME: 应该区分 closure 和 captured
      return "可调用的";
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
  | ErrorValue;

export interface ConcreteValue {
  isRuntimeValue: true;
  kind: "concrete";
  value: number | boolean | Callable | ConcreteValue[];
  step: Step;
}

export interface Callable {
  isRuntimeValue: true;
  kind: "callable";
  callableKind: "closure" | "captured";
  call: (args: ConcreteValue[], style: FunctionCallStyle) => RuntimeValue;
  forceArity: number | undefined;
}

export interface LazyValue {
  isRuntimeValue: true;
  kind: "lazy";
  execute: (args: (Node | ConcreteValue)[]) => RuntimeValue;
  args: (Node | ConcreteValue)[];
  /**
   * 是否不能修改 args。
   */
  frozen: boolean;
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
          if (v.value.kind === "callable") return "callable";
          throw new Unreachable();
      }
    case "lazy":
      return "lazy";
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
    isRuntimeValue: true,
    kind: "concrete",
    value,
    step,
  };
}

export function callableValue(
  kind: Callable["callableKind"],
  call: (args: ConcreteValue[], style: FunctionCallStyle) => RuntimeValue,
  forceArity: number | undefined,
): ConcreteValue {
  return concreteValue({
    isRuntimeValue: true,
    kind: "callable",
    callableKind: kind,
    call,
    forceArity,
  }, ["TODO: step for callable"]);
}

export function asCallable(v: RuntimeValue): Callable | null {
  if (v.kind !== "concrete") return null;
  if (typeof v.value !== "object") return null;
  if (Array.isArray(v.value)) return null;
  if (v.value.kind !== "callable") return null;
  return v.value;
}

export function lazyValue(
  fn: LazyValue["execute"],
  args: LazyValue["args"],
  isFrozen: boolean,
): LazyValue {
  return {
    isRuntimeValue: true,
    kind: "lazy",
    execute: fn,
    args,
    frozen: isFrozen,
  };
}

export function asLazyValue(v: RuntimeValue): LazyValue | null {
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
