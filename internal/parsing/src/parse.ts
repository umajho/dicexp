import { Unreachable } from "./errors";

import { Node, Node_Value, value } from "@dicexp/nodes";
import { convertTextToHalfWidth } from "./fullwidth_convertion";

import { parser as lezerParser } from "./grammars/dicexp.grammar.js";
import { Transformer } from "./transformer";
import { simpleParse } from "./parse_simple";

export interface ParseOptions {
  optimizesForSimpleCases?: boolean;
}

export function parse(code: string, opts?: ParseOptions): Node {
  code = convertTextToHalfWidth(code);

  if (opts?.optimizesForSimpleCases ?? true) {
    const result = simpleParse(code);
    if (result) return result;
  }

  const tree = lezerParser.parse(code);
  const transformer = new Transformer(tree, code);
  return transformer.transform();
}

export function parseInteger(sourceString: string, replacesDash = true) {
  if (replacesDash) {
    sourceString = sourceString.replace("_", "");
  }
  const int = parseInt(sourceString);
  if (int < Number.MIN_SAFE_INTEGER) {
    // TODO: throw error
    return value(-Infinity);
  } else if (int > Number.MAX_SAFE_INTEGER) {
    // TODO: throw error
    return value(Infinity);
  }
  return value(int);
}

export function negateInteger(target: Node_Value) {
  if (typeof target.value !== "number") throw new Unreachable();
  return value(-target.value);
}

export function parseBoolean(sourceString: string) {
  switch (sourceString) {
    case "true":
      return value(true);
    case "false":
      return value(false);
    default:
      throw new Unreachable();
  }
}
