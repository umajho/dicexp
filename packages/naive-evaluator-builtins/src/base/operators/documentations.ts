import { localizeValueType } from "../../../../../internal/l10n/lib";
import { DeclarationListToDocumentationMap } from "@dicexp/naive-evaluator-runtime/regular-functions";

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
    description: {
      brief: "逻辑或运算",
      further: "判断两个值是否任意为「真」。",
    },
    examples: [
      "true or false",
    ],
  },
  "and/2": {
    isOperator: true,
    groups: ["逻辑"],
    parameters: {
      "a": "第一个布尔值",
      "b": "第二个布尔值",
    },
    description: {
      brief: "逻辑与运算",
      further: "判断两个值是否全部为「真」。",
    },
    examples: [
      "true and false",
    ],
  },

  "==/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值，类型与第一个值相同",
    },
    description: { brief: "判断相等" },
    returnValue: { type: { description: "与第一个值的类型相同" } },
    examples: [
      "1==1",
      "true==false",
    ],
  },
  "!=/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值，类型与第一个值相同",
    },
    description: { brief: "判断相异" },
    returnValue: { type: { description: "与第一个值的类型相同" } },
    examples: [
      "1!=1",
      "true!=false",
    ],
  },

  "</2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值",
    },
    description: { brief: "小于" },
    examples: [
      "1<2",
    ],
  },
  ">/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值",
    },
    description: { brief: "大于" },
    examples: [
      "2>1",
    ],
  },
  "<=/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值",
    },
    description: { brief: "小于或等于" },
    examples: [
      "1<=1",
    ],
  },
  ">=/2": {
    isOperator: true,
    groups: ["比较"],
    parameters: {
      "a": "第一个值",
      "b": "第二个值",
    },
    description: { brief: "大于或等于" },
    examples: [
      "1>=1",
    ],
  },

  "~/2": {
    isOperator: true,
    groups: ["掷骰"],
    parameters: {
      "lower": "最小值，大于 0",
      "upper": "最大值，不小于最小值",
    },
    description: {
      brief: "范围生成随机整数",
      further: "随机生成一个最小值与最大值之间（包含两端）的整数。",
    },
    examples: [
      "1~10",
    ],
  },
  "~/1": {
    isOperator: true,
    groups: ["掷骰"],
    parameters: {
      "upper": "最大值，大于 0",
    },
    description: {
      brief: "「1」至范围生成随机整数",
      further: "随机生成一个 1 与最大值之间（包含两端）的整数。",
    },
    examples: [
      "~10",
    ],
  },
  "+/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "第一个加数",
      "b": "第二个加数",
    },
    description: { brief: "相加" },
    examples: [
      "1+2",
    ],
  },
  "-/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "被减数",
      "b": "减数",
    },
    description: { brief: "相减" },
    examples: [
      "1-2",
    ],
  },
  "+/1": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "一个数",
    },
    description: { brief: "不变" },
    examples: [
      "+1",
    ],
  },
  "-/1": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "一个数",
    },
    description: { brief: "取相反数" },
    examples: [
      "-1",
      "-(+1)",
    ],
  },

  "*/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "第一个乘数",
      "b": "第二个乘数",
    },
    description: { brief: "相乘" },
    examples: [
      "3*4",
    ],
  },
  "///2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "被除数",
      "b": "除数，不能为 0",
    },
    description: { brief: "相整除" },
    examples: [
      "1//2",
      "4//2",
      "5//2",
    ],
  },
  "%/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "被除数，不小于 0",
      "b": "除数，大于 0",
    },
    description: { brief: "取余数" },
    examples: [
      "1%2",
      "4%2",
      "5%2",
    ],
  },
  "**/2": {
    isOperator: true,
    groups: ["算术"],
    parameters: {
      "a": "底数",
      "n": "指数，不小于 0",
    },
    description: { brief: "幂运算" },
    examples: [
      "2**3",
    ],
  },

  "d/2": {
    isOperator: true,
    groups: ["掷骰"],
    parameters: {
      "n": "投掷次数，大于 0",
      "x": "面数，不小于 0",
    },
    returnValue: {
      type: {
        description: `通常返回「${localizeValueType("stream$sum")}」。` +
          `但如果面数为 0，会返回「${localizeValueType("integer")}」0。`,
      },
    },
    description: {
      brief: "投掷数个骰子",
      further: "投掷 n 个 x 面骰子，获得点数之和。",
    },
    examples: [
      "1d10",
      "3d10",
    ],
  },
  "d/1": {
    isOperator: true,
    groups: ["掷骰"],
    parameters: {
      "x": "面数，不小于 0",
    },
    description: {
      brief: "投掷一个骰子",
      further: "投掷 1 个 x 面骰子，获得其点数。",
    },
    examples: [
      "d10",
    ],
  },

  "not/1": {
    isOperator: true,
    groups: ["逻辑"],
    parameters: {
      "a": "一个布尔值",
    },
    description: { brief: "逻辑非运算" },
    examples: [
      "not true",
    ],
  },
};
