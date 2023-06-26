import type { RegularFunctionDeclaration } from "@dicexp/runtime/regular-functions";

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
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "integer" },
  },
  // has?/2
  {
    name: "sum",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "product",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "integer" },
  },
  // min/1
  // max/1
  // all?/1
  // all?/2
  {
    name: "any?",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "boolean" },
  },
  // any?/2
  {
    name: "sort",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "list" },
  },
  // sort/2
  // reverse/1
  // concat/2
  // prepend/2
  {
    name: "append",
    parameters: [
      { label: "list", type: "list" },
      { label: "el", type: "$lazy" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "at",
    parameters: [
      { label: "list", type: "list" },
      { label: "index", type: "integer" },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true },
    },
  },
  // at/3
  // duplicate/2
  // flatten/2
  // flattenAll/1

  // 函数式：
  {
    name: "map",
    parameters: [
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "list" },
  },
  // flatMap/2
  {
    name: "filter",
    parameters: [
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "list" },
  },
  // foldl/3
  // foldr/3
  {
    name: "head",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true },
    },
  },
  {
    name: "tail",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "list" },
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
      { label: "list1", type: "list" },
      { label: "list2", type: "list" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "zipWith",
    parameters: [
      { label: "list1", type: "list" },
      { label: "list2", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "list" },
  },

  // 控制流
] as const) satisfies readonly RegularFunctionDeclaration[];
