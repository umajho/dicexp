import { Node } from "@dicexp/nodes";
import { convertTextToHalfWidth } from "./utils";

import { parser as lezerParser } from "@dicexp/lezer";
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
