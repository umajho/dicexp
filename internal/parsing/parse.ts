import { Unreachable } from "../../errors.ts";

import { Node, Node_Value, value } from "./building_blocks.ts";
import { convertTextToHalfWidth } from "./fullwidth_convertion.ts";

import { parser as lezerParser } from "./dicexp.grammar.js";
import { Transformer } from "./transformer.ts";
import { simpleParse } from "./parse_simple.ts";

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
  // @ts-ignore "@lezer/lr@1.3.3" 和 "@lezer/common@1.0.2" 的 Tree 不兼容？
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
