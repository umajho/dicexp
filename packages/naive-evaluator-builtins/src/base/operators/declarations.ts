import { RegularFunctionDeclaration } from "@dicexp/naive-evaluator-runtime/regular-functions";

export const builtinOperatorDeclarations = ([
  {
    name: "or",
    parameters: [
      { label: "a", type: "boolean" },
      { label: "b", type: "boolean" },
    ],
    returnValue: { type: "boolean" },
  },
  {
    name: "and",
    parameters: [
      { label: "a", type: "boolean" },
      { label: "b", type: "boolean" },
    ],
    returnValue: { type: "boolean" },
  },

  {
    name: "==",
    parameters: [
      { label: "a", type: new Set(["integer", "boolean"]) },
      { label: "b", type: new Set(["integer", "boolean"]) },
    ],
    returnValue: {
      type: { dynamic: true },
    },
  },
  {
    name: "!=",
    parameters: [
      { label: "a", type: new Set(["integer", "boolean"]) },
      { label: "b", type: new Set(["integer", "boolean"]) },
    ],
    returnValue: {
      type: { dynamic: true },
    },
  },

  {
    name: "<",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "boolean" },
  },
  {
    name: ">",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "boolean" },
  },
  {
    name: "<=",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "boolean" },
  },
  {
    name: ">=",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "boolean" },
  },

  {
    name: "~",
    parameters: [
      { label: "lower", type: "integer" },
      { label: "upper", type: "integer" },
    ],
    returnValue: { type: "stream$sum" },
  },
  {
    name: "~",
    parameters: [
      { label: "upper", type: "integer" },
    ],
    returnValue: { type: "stream$sum" },
  },

  {
    name: "+",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "-",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "+",
    parameters: [
      { label: "a", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "-",
    parameters: [
      { label: "a", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },

  {
    name: "*",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "//",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "%",
    parameters: [
      { label: "a", type: "integer" },
      { label: "b", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },
  {
    name: "**",
    aliases: ["^"],
    parameters: [
      { label: "a", type: "integer" },
      { label: "n", type: "integer" },
    ],
    returnValue: { type: "integer" },
  },

  {
    name: "d",
    parameters: [
      { label: "n", type: "integer" },
      { label: "x", type: "integer" },
    ],
    returnValue: { type: { dynamic: true } },
  },
  {
    name: "d",
    parameters: [
      { label: "x", type: "integer" },
    ],
    returnValue: { type: "stream$sum" },
  },

  {
    name: "not",
    parameters: [
      { label: "a", type: "boolean" },
    ],
    returnValue: { type: "boolean" },
  },
] as const) satisfies readonly RegularFunctionDeclaration[];
