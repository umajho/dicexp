import type { RegularFunctionDeclaration } from "../../regular_functions";

export const builtinOperatorDeclarations = ([
  {
    name: "or",
    isOperator: true,
    parameters: [
      { label: "a", type: "boolean", description: "第一个布尔值" },
      { label: "b", type: "boolean", description: "第二个布尔值" },
    ],
    returnValue: { type: "boolean" },
    description: "判断两个值是否任意为真。",
  },
  {
    name: "and",
    isOperator: true,
    parameters: [
      { label: "a", type: "boolean", description: "第一个布尔值" },
      { label: "b", type: "boolean", description: "第二个布尔值" },
    ],
    returnValue: { type: "boolean" },
    description: "判断两个值是否全部为真。",
  },

  {
    name: "==",
    isOperator: true,
    parameters: [
      { label: "a", type: ["integer", "boolean"], description: "第一个值" },
      {
        label: "b",
        type: ["integer", "boolean"],
        description: "第二个值，类型与第一个值相同",
      },
    ],
    returnValue: {
      type: { dynamic: true, description: "与第一个值的类型相同" },
    },
    description: "判断两个值是否相等。",
  },
  {
    name: "!=",
    isOperator: true,
    parameters: [
      { label: "a", type: ["integer", "boolean"], description: "第一个值" },
      {
        label: "b",
        type: ["integer", "boolean"],
        description: "第二个值，类型与第一个值相同",
      },
    ],
    returnValue: {
      type: { dynamic: true, description: "与第一个值的类型相同" },
    },
    description: "判断两个值是否相异。",
  },

  {
    name: "<",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "第一个值" },
      { label: "b", type: "integer", description: "第二个值" },
    ],
    returnValue: { type: "boolean" },
    description: "判断是否 a 小于 b。",
  },
  {
    name: ">",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "第一个值" },
      { label: "b", type: "integer", description: "第二个值" },
    ],
    returnValue: { type: "boolean" },
    description: "判断是否 a 大于 b。",
  },
  {
    name: "<=",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "第一个值" },
      { label: "b", type: "integer", description: "第二个值" },
    ],
    returnValue: { type: "boolean" },
    description: "判断是否 a 小于或等于 b。",
  },
  {
    name: ">=",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "第一个值" },
      { label: "b", type: "integer", description: "第二个值" },
    ],
    returnValue: { type: "boolean" },
    description: "判断是否 a 大于或等于 b。",
  },

  {
    name: "~",
    isOperator: true,
    parameters: [
      { label: "lower", type: "integer", description: "最小值，大于 0" },
      { label: "upper", type: "integer", description: "最大值，不小于最小值" },
    ],
    returnValue: { type: "integer" }, // TODO: yielder
    description: "随机生成一个最小值与最大值之间（包含两端）的整数。",
  },
  {
    name: "~",
    isOperator: true,
    parameters: [
      { label: "upper", type: "integer", description: "最大值，大于 0" },
    ],
    returnValue: { type: "integer" }, // TODO: yielder
    description:
      "随机生成一个 1 与最大值之间（包含两端）的整数。等价于 `1~<upper>`",
  },

  {
    name: "+",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "第一个加数" },
      { label: "b", type: "integer", description: "第二个加数" },
    ],
    returnValue: { type: "integer" },
    description: "两数相加。",
  },
  {
    name: "-",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "被减数" },
      { label: "b", type: "integer", description: "减数" },
    ],
    returnValue: { type: "integer" },
    description: "两数相减。",
  },
  {
    name: "+",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "一个数" },
    ],
    returnValue: { type: "integer" },
    description: "不变。",
  },
  {
    name: "-",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "一个数" },
    ],
    returnValue: { type: "integer" },
    description: "取相反数。",
  },

  {
    name: "*",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "第一个乘数" },
      { label: "b", type: "integer", description: "第二个乘数" },
    ],
    returnValue: { type: "integer" },
    description: "两数相乘。",
  },
  {
    name: "//",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "被除数" },
      { label: "b", type: "integer", description: "除数，不能为 0" },
    ],
    returnValue: { type: "integer" },
    description: "两数相整除。",
  },
  {
    name: "%",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "被除数，不小于 0" },
      { label: "b", type: "integer", description: "除数，大于 0" },
    ],
    returnValue: { type: "integer" },
    description: "两数相除后取余。",
  },
  {
    name: "^",
    isOperator: true,
    parameters: [
      { label: "a", type: "integer", description: "底数" },
      { label: "n", type: "integer", description: "指数，不小于 0" },
    ],
    returnValue: { type: "integer" },
    description: "幂运算。",
  },

  {
    name: "d",
    isOperator: true,
    parameters: [
      { label: "n", type: "integer", description: "投掷次数，大于 0" },
      { label: "x", type: "integer", description: "面数，大于 0" },
    ],
    returnValue: { type: "integer" }, // TODO: yielder
    description: "投掷 n 个 x 面骰子，获得点数之和。",
  },
  {
    name: "d",
    isOperator: true,
    parameters: [
      { label: "x", type: "integer", description: "面数，大于 0" },
    ],
    returnValue: { type: "integer" }, // TODO: yielder
    description: "投掷 1 个 x 面骰子，获得其点数。",
  },

  {
    name: "not",
    isOperator: true,
    parameters: [
      { label: "a", type: "boolean", description: "一个布尔值" },
    ],
    returnValue: { type: "boolean" },
    description: "取非。",
  },
] as const) satisfies readonly RegularFunctionDeclaration[];
