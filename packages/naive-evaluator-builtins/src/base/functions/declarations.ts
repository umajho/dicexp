import { RegularFunctionDeclaration } from "@dicexp/naive-evaluator-runtime/regular-functions";

export const builtinFunctionDeclarations = ([
  // 掷骰：
  {
    name: "reroll",
    parameters: [
      { label: "seq", type: new Set(["sequence", "sequence$sum"]) },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: { dynamic: true } },
  },
  {
    name: "explode",
    parameters: [
      { label: "seq", type: new Set(["sequence", "sequence$sum"]) },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: { dynamic: true } },
  },

  // 实用：
  {
    name: "abs",
    parameters: [
      { label: "n", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "count",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "count",
    parameters: [
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "has?",
    parameters: [
      { label: "list", type: "list" },
      { label: "value", type: new Set(["integer", "boolean"]) },
    ],
    returnValue: { type: "boolean" },
  },
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
  {
    name: "min",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "max",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "all?",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "boolean" },
  },
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
  {
    name: "sort",
    parameters: [
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "reverse",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "concat",
    parameters: [
      { label: "list1", type: "list" },
      { label: "list2", type: "list" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "prepend",
    parameters: [
      { label: "list", type: "list" },
      { label: "el", type: "$lazy" },
    ],
    returnValue: { type: "list" },
  },
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
  {
    name: "at",
    parameters: [
      { label: "list", type: "list" },
      { label: "index", type: "integer" },
      { label: "default", type: "$lazy" },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true },
    },
  },
  {
    name: "duplicate",
    parameters: [
      { label: "value", type: "$lazy" },
      { label: "count", type: "integer" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "flatten",
    parameters: [
      { label: "list", type: "list" },
      { label: "depth", type: "integer" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "flattenAll",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "list" },
  },

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
    name: "flatMap",
    parameters: [
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "filter",
    parameters: [
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "foldl",
    parameters: [
      { label: "list", type: "list" },
      { label: "init", type: "$lazy" },
      { label: "callable", type: "callable" },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true },
    },
  },
  {
    name: "foldr",
    parameters: [
      { label: "list", type: "list" },
      { label: "init", type: "$lazy" },
      { label: "callable", type: "callable" },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true },
    },
  },
  {
    name: "unfold",
    parameters: [
      { label: "seed", type: "$lazy" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "sequence" },
  },
  {
    name: "iterate",
    parameters: [
      { label: "start", type: "$lazy" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "sequence" },
  },
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
  {
    name: "last",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: {
      type: { dynamic: true, lazy: true },
    },
  },
  {
    name: "init",
    parameters: [
      { label: "list", type: "list" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "take",
    parameters: [
      {
        label: "list",
        type: new Set(["list", "sequence", "sequence$sum"]),
      },
      { label: "n", type: "integer" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "takeWhile",
    parameters: [
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "list" },
  },
  {
    name: "drop",
    parameters: [
      {
        label: "list",
        type: new Set(["list", "sequence", "sequence$sum"]),
      },
      { label: "n", type: "integer" },
    ],
    returnValue: { type: { dynamic: true } },
  },
  {
    name: "dropWhile",
    parameters: [
      { label: "list", type: "list" },
      { label: "callable", type: "callable" },
    ],
    returnValue: { type: "list" },
  },
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
