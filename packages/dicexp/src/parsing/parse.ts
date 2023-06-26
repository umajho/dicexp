import type { Node } from "@dicexp/nodes";
import { convertTextToHalfWidth } from "./utils";

import { parser as lezerParser } from "@dicexp/lezer";
import { Transformer } from "./transformer";
import { ParsingError } from "./parsing_error";

export interface ParseOptions {
  optimizesForSimpleCases?: false;
}

export type ParsingResult =
  | { ok: Node; simple: false }
  | { error: ParsingError };

export function parse(code: string, _opts?: ParseOptions): ParsingResult {
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
