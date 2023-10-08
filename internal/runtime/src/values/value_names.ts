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
    case "stream$sum":
      return "流【隐式转换为求和整数】";
    case "stream$list":
      return "流【隐式转换为列表】";
    default:
      return `未知（内部实现泄漏，${name}）`;
  }
}

export function getDisplayNameOfValue(value: Value): string {
  return getDisplayNameFromTypeName(getTypeNameOfValue(value));
}
