import type { Node } from "@dicexp/nodes";
import { convertTextToHalfWidth } from "./utils";

import { parser as lezerParser } from "@dicexp/lezer";
import { ParsingError, Transformer } from "./transformer";

export interface ParseOptions {
  optimizesForSimpleCases?: false;
}

export type ParsingResult =
  | { ok: Node; simple: false }
  | { error: ParsingError };

export function parse(code: string, opts?: ParseOptions): ParsingResult {
  code = convertTextToHalfWidth(code);

  const tree = lezerParser.parse(code);
  const transformer = new Transformer(tree, code);
  try {
    return { ok: transformer.transform(), simple: false };
  } catch (e) {
    if (e instanceof ParsingError) return { error: e };
    throw e;
  }
}
