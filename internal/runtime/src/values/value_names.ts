import { Unreachable } from "@dicexp/errors";

import { Value } from "./values";

export function getTypeNameOfValue(v: Value) {
  switch (typeof v) {
    case "number":
      return "integer";
    case "boolean":
      return "boolean";
    default:
      if (Array.isArray(v)) return "list";
      return v.type;
      throw new Unreachable();
  }
}

export type ValueTypeName = ReturnType<typeof getTypeNameOfValue>;

export function getDisplayNameFromTypeName(name: ValueTypeName): string {
  switch (name) {
    case "integer":
      return "整数";
    case "boolean":
      return "布尔";
    case "list":
      return "列表";
    // case "closure":
    //   return "匿名函数";
    // case "captured":
    //   return "被捕获的通常函数";
    case "callable":
      return "可调用的";
    case "integer$sum_extendable":
      return "整数【求和，可扩展】";
    case "list$extendable":
      return "列表【可扩展】";
    default:
      return `未知（内部实现泄漏，${name}）`;
  }
}

export function getDisplayNameOfValue(value: Value): string {
  return getDisplayNameFromTypeName(getTypeNameOfValue(value));
}
