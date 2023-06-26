import type { DeclarationListToDocumentationMap } from "@dicexp/runtime/src/regular-functions/types/docs";
import { builtinFunctionDeclarations } from "./declarations";

export const builtinFunctionDocumentations: DeclarationListToDocumentationMap<
  typeof builtinFunctionDeclarations
> = {
  // 实用：
  "count/2": {
    parameters: {
      "list": "要计数的列a",
      "callable": "用于判断元素是否计入。输入列表元素，期待输出布尔值",
    },
    description: "对 list 计数，只计入 callable 返回真的元素。",
  },
  // ...
  "sum/1": {
    parameters: {
      "list": "由整数组成的列表",
    },
    description: "list 所有元素相加。",
  },
  "product/1": {
    parameters: {
      "list": "由整数组成的列表",
    },
    description: "list 所有元素相乘",
  },
  // ...
  "any?/1": {
    parameters: {
      "list": "由布尔值组成的列表",
    },
    description: "判断 list 中是否存在为真的元素。（不存在则返回假。）",
  },
  // ...
  "sort/1": {
    parameters: {
      "list": "要排序的列表。所有元素类型一致，可以是整数或布尔值",
    },
    description: "将 list 由小到大排序。",
  },
  // ...
  "append/2": {
    parameters: {
      "list": "要添加元素的列表",
      "el": "要添加的元素",
    },
    description: "将 el 添加到 list 后方。",
  },
  "at/2": {
    parameters: {
      "list": "要取出元素的列表",
      "index": "要取出的元素的索引，以 0 开始",
    },
    description: "从 list 中取出第 index+1 个元素。",
    returnValue: { type: { description: "取出的元素" } },
  },
  // ...

  // 函数式：
  "map/2": {
    parameters: {
      "list": "目标列表",
      "callable": "对每个元素的映射操作。输入列表元素，期待输出映射结果",
    },
    description: "将 list 的元素由 callable 一一映射，得到映射后的列表。",
  },
  // ...
  "filter/2": {
    parameters: {
      "list": "目标列表",
      "callable": "用于判断元素是否保留。输入列表元素，期待输出布尔值",
    },
    description: "将 list 的元素用 callable 过滤，得到过滤后的列表。",
  },
  // ...
  "head/1": {
    parameters: {
      "list": "目标列表",
    },
    description: "取出列表的头部（第一个）元素。",
    returnValue: { type: { description: "头部元素的类型" } },
  },
  "tail/1": {
    parameters: {
      "list": "目标列表",
    },
    description: "获得除去头部（第一个）元素的列表。",
  },
  // ...
  "zip/2": {
    parameters: {
      "list1": "第一个列表",
      "list2": "第二个列表",
    },
    description: "将两个列表合并成新的列表，" +
      "新的列表的每个元素是由原先两个列表对应位置元素组合而成的长度为 2 的列表。" +
      "如果两个列表长度不同，只会合并到较短列表的结束位置。",
  },
  "zipWith/3": {
    parameters: {
      "list1": "第一个列表",
      "list2": "第二个列表",
      "callable":
        "合并两个元素的操作。输入两个列表位置对应的两个元素，期待输出合并结果",
    },
    description: "将两个列表合并成新的列表，" +
      "新的列表的每个元素是由原先两个列表对应位置元素由 callable 合并而成。" +
      "如果两个列表长度不同，只会合并到较短列表的结束位置。",
  },

  // 控制流
};
