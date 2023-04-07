import type { RegularFunctionDeclaration } from "../../regular_functions";

export const builtinFunctionDeclarations = ([
  // 投骰子：
  // reroll/2
  // explode/2

  // 实用：
  // abs/1
  // count/1
  {
    name: "count",
    parameters: [
      { label: "list", type: "list", description: "要计数的列表" },
      {
        label: "callable",
        type: "callable",
        description: "用于判断元素是否计入。输入列表元素，期待输出布尔值",
      },
    ],
    returnValue: { type: "integer" },
    description: "对 list 计数，只计入 callable 返回真的元素。",
  },
  // has?/2
  {
    name: "sum",
    parameters: [
      { label: "list", type: "list", description: "由整数组成的列表" },
    ],
    returnValue: { type: "integer" },
    description: "list 所有元素相加。",
  },
  {
    name: "product",
    parameters: [
      { label: "list", type: "list", description: "由整数组成的列表" },
    ],
    returnValue: { type: "integer" },
    description: "list 所有元素相乘",
  },
  // min/1
  // max/1
  // all?/1
  // all?/2
  {
    name: "any?",
    parameters: [
      { label: "list", type: "list", description: "由布尔值组成的列表" },
    ],
    returnValue: { type: "boolean" },
    description: "判断 list 中是否存在为真的元素。（不存在则返回假。）",
  },
  // any?/2
  {
    name: "sort",
    parameters: [
      {
        label: "list",
        type: "list",
        description: "要排序的列表。所有元素类型一致，可以是整数或布尔值",
      },
    ],
    returnValue: { type: "list" },
    description: "将 list 由小到大排序。",
  },
  // sort/2
  // reverse/1
  // concat/2
  // prepend/2
  {
    name: "append",
    parameters: [
      { label: "list", type: "list", description: "要添加元素的列表" },
      { label: "el", type: "$lazy", description: "要添加的元素" },
    ],
    returnValue: { type: "list" },
    description: "将 el 添加到 list 后方。",
  },
  {
    name: "at",
    parameters: [
      { label: "list", type: "list", description: "要取出元素的列表" },
      {
        label: "index",
        type: "integer",
        description: "要取出的元素的索引，以 0 开始",
      },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true, description: "取出的元素" },
    },
    description: "从 list 中取出第 index+1 个元素。",
  },
  // at/3
  // duplicate/2
  // flatten/2
  // flattenAll/1

  // 函数式：
  {
    name: "map",
    parameters: [
      { label: "list", type: "list", description: "目标列表" },
      {
        label: "callable",
        type: "callable",
        description: "对每个元素的映射操作。输入列表元素，期待输出映射结果",
      },
    ],
    returnValue: { type: "list" },
    description: "将 list 的元素由 callable 一一映射，得到映射后的列表。",
  },
  // flatMap/2
  {
    name: "filter",
    parameters: [
      { label: "list", type: "list", description: "目标列表" },
      {
        label: "callable",
        type: "callable",
        description: "用于判断元素是否保留。输入列表元素，期待输出布尔值",
      },
    ],
    returnValue: { type: "list" },
    description: "将 list 的元素用 callable 过滤，得到过滤后的列表。",
  },
  // foldl/3
  // foldr/3
  {
    name: "head",
    parameters: [
      { label: "list", type: "list", description: "目标列表" },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true, description: "头部元素的类型" },
    },
    description: "取出列表的头部（第一个）元素。",
  },
  {
    name: "tail",
    parameters: [
      { label: "list", type: "list", description: "目标列表" },
    ],
    returnValue: { type: "list" },
    description: "获得除去头部（第一个）元素的列表。",
  },
  // last/1
  // init/1
  // take/2
  // takeWhile/2
  // drop/2
  // dropWhile/2
  {
    name: "zip",
    parameters: [
      { label: "list1", type: "list", description: "第一个列表" },
      { label: "list2", type: "list", description: "第二个列表" },
    ],
    returnValue: { type: "list" },
    description: "将两个列表合并成新的列表，" +
      "新的列表的每个元素是由原先两个列表对应位置元素组合而成的长度为 2 的列表。" +
      "如果两个列表长度不同，只会合并到较短列表的结束位置。",
  },
  {
    name: "zipWith",
    parameters: [
      { label: "list1", type: "list", description: "第一个列表" },
      { label: "list2", type: "list", description: "第二个列表" },
      {
        label: "callable",
        type: "callable",
        description:
          "合并两个元素的操作。输入两个列表位置对应的两个元素，期待输出合并结果",
      },
    ],
    returnValue: { type: "list" },
    description: "将两个列表合并成新的列表，" +
      "新的列表的每个元素是由原先两个列表对应位置元素由 callable 合并而成。" +
      "如果两个列表长度不同，只会合并到较短列表的结束位置。",
  },

  // 控制流
  {
    name: "if",
    parameters: [
      { label: "condition", type: "boolean", description: "判断" },
      { label: "whenTrue", type: "$lazy", description: "判断为真时的结果" },
      { label: "whenFalse", type: "$lazy", description: "判断为假时的结果" },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true, description: "根据判断结果而定" },
    },
    description: "根据判断返回对应的结果。",
  },
] as const) satisfies readonly RegularFunctionDeclaration[];
