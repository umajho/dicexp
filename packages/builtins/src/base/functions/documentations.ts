import { DeclarationListToDocumentationMap } from "@dicexp/runtime/src/regular-functions/types/docs";
import { builtinFunctionDeclarations } from "./declarations";

export const builtinFunctionDocumentations: DeclarationListToDocumentationMap<
  typeof builtinFunctionDeclarations
> = {
  // 实用：
  "count/2": {
    groups: ["实用"],
    parameters: {
      "list": "要计数的列表",
      "callable": "用于判断元素是否计入。输入列表元素，期待输出布尔值",
    },
    description: { brief: "有条件计数列表" },
  },
  // ...
  "sum/1": {
    groups: ["实用"],
    parameters: {
      "list": "由整数组成的列表",
    },
    description: { brief: "求列表项之和" },
  },
  "product/1": {
    groups: ["实用"],
    parameters: {
      "list": "由整数组成的列表",
    },
    description: { brief: "求列表项之积" },
  },
  // ...
  "any?/1": {
    groups: ["实用"],
    parameters: {
      "list": "由布尔值组成的列表",
    },
    description: {
      brief: "判断列表中是否存在「真」",
      further: "空列表返回「假」。",
    },
  },
  // ...
  "sort/1": {
    groups: ["实用"],
    parameters: {
      "list": "要排序的列表。所有元素类型一致，可以是整数或布尔值",
    },
    description: { brief: "排序列表（由小到大）" },
  },
  // ...
  "append/2": {
    groups: ["实用"],
    parameters: {
      "list": "要添加元素的列表",
      "el": "要添加的元素",
    },
    description: { brief: "追加元素至列表最后" },
  },
  "at/2": {
    groups: ["实用"],
    parameters: {
      "list": "要取出元素的列表",
      "index": "要取出的元素的索引，以 0 开始",
    },
    description: {
      brief: "取出列表中索引处对应值",
      further: "索引由 0 开始。",
    },
    returnValue: { type: { description: "取出元素的类型" } },
  },
  // ...

  // 函数式：
  "map/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "callable": "对每个元素的映射操作。输入列表元素，期待输出映射结果",
    },
    description: {
      brief: "映射列表项",
      further: "返回元素由先前对应元素经过操作变换后的新列表。",
    },
  },
  // ...
  "filter/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "callable": "用于判断元素是否保留。输入列表元素，期待输出布尔值",
    },
    description: {
      brief: "过滤列表项",
      further: "返回由通过过滤的元素组成的新列表。",
    },
  },
  // ...
  "head/1": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
    },
    description: { brief: "取出列表首个元素" },
    returnValue: { type: { description: "首个元素的类型" } },
  },
  "tail/1": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
    },
    description: {
      brief: "排除列表首个元素",
      further: "返回不含原先列表中首个元素的新列表。",
    },
  },
  // ...
  "zip/2": {
    groups: ["函数式"],
    parameters: {
      "list1": "第一个列表",
      "list2": "第二个列表",
    },
    description: {
      brief: "合并两个列表",
      further: [
        "新的列表的每个元素是由原先两个列表对应位置的元素组合而成的、长度为 2 的列表。",
        "如果两个列表长度不同，只会合并到较短列表的结束位置。",
      ].join("\n"),
    },
  },
  "zipWith/3": {
    groups: ["函数式"],
    parameters: {
      "list1": "第一个列表",
      "list2": "第二个列表",
      "callable":
        "合并两个元素的操作。输入两个列表位置对应的两个元素，期待输出合并结果",
    },
    description: {
      brief: "按照操作合并两个列表",
      further: [
        "新的列表的每个元素是由原先两个列表对应位置的元素由调用 callable 合并而成。",
        "如果两个列表长度不同，只会合并到较短列表的结束位置。",
      ].join("\n"),
    },
  },
  // 控制流
};
