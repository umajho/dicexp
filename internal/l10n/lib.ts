import { ValueType } from "@dicexp/interface";

export function localizeValueType(vt: ValueType) {
  switch (vt) {
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
    case "sequence$sum":
      return "求和序列";
    case "sequence":
      return "序列";
    default:
      return `未知（内部实现泄漏，${name}）`;
  }
}
