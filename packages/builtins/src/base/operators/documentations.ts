import { DeclarationListToDocumentationMap } from "@dicexp/runtime/src/regular-functions/types/docs";
import { builtinOperatorDeclarations } from "./declarations";

export const builtinOperatorDocumentations: DeclarationListToDocumentationMap<
  typeof builtinOperatorDeclarations
> = {
  "or/2": {
    isOperator: true,
    groups: ["逻辑"],
    parameters: {
      "a": "第一个布尔值",
      "b": "第二个布尔值",
    },
    description: "判断两个值是否任意为真。",
  },
  "and/2": {
    isOperator: true,
    groups: ["逻辑"],
    parameters: {
      "a": "第一个布尔值",
      "b": "第二个布尔值",
    },
    description: "判断两个值是否全部为真。",
  },

  "==/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值，类型与第一个值相同",
    },
    description: "判断两个值是否相等。",
    returnValue: { type: { description: "与第一个值的类型相同" } },
  },
  "!=/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值，类型与第一个值相同",
    },
    description: "判断两个值是否相异。",
    returnValue: { type: { description: "与第一个值的类型相同" } },
  },

  "</2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值",
    },
    description: "判断是否 a 小于 b。",
  },
  ">/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值",
    },
    description: "判断是否 a 大于 b。",
  },
  "<=/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值",
    },
    description: "判断是否 a 小于或等于 b。",
  },
  ">=/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值",
    },
    description: "判断是否 a 大于或等于 b。",
  },

  "~/2": {
    isOperator: true,
    groups: ["掷骰"],
    parameters: {
      "lower": "最小值，大于 0",
      "upper": "最大值，不小于最小值",
    },
    description: "随机生成一个最小值与最大值之间（包含两端）的整数。",
  },
  "~/1": {
    isOperator: true,
    groups: ["掷骰"],
    parameters: {
      "upper": "最大值，大于 0",
    },
    description: "两数相加。",
  },
  "+/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "第一个加数",
      "b": "第二个加数",
    },
    description: "两数相加。",
  },
  "-/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "被减数",
      "b": "减数",
    },
    description: "两数相减。",
  },
  "+/1": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "一个数",
    },
    description: "不变。",
  },
  "-/1": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "一个数",
    },
    description: "取相反数。",
  },

  "*/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "第一个乘数",
      "b": "第二个乘数",
    },
    description: "两数相乘。",
  },
  "///2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "被除数",
      "b": "除数，不能为 0",
    },
    description: "两数相整除。",
  },
  "%/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "被除数，不小于 0",
      "b": "除数，大于 0",
    },
    description: "两数相除后取余。",
  },
  "^/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "底数",
      "n": "指数，不小于 0",
    },
    description: "幂运算。",
  },

  "d/2": {
    isOperator: true,
    groups: ["掷骰"],
    parameters: {
      "n": "投掷次数，大于 0",
      "x": "面数，大于 0",
    },
    description: "投掷 n 个 x 面骰子，获得点数之和。",
  },
  "d/1": {
    isOperator: true,
    groups: ["掷骰"],
    parameters: {
      "x": "面数，大于 0",
    },
    description: "投掷 1 个 x 面骰子，获得其点数。",
  },

  "not/1": {
    isOperator: true,
    groups: ["逻辑"],
    parameters: {
      "a": "一个布尔值",
    },
    description: "取非。",
  },
};
