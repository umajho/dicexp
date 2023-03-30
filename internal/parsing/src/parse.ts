import type { Node } from "@dicexp/nodes";
import { convertTextToHalfWidth } from "./utils";

import { parser as lezerParser } from "@dicexp/lezer";
import { ParsingError, Transformer } from "./transformer";
import { simpleParse } from "./parse_simple";

export interface ParseOptions {
  optimizesForSimpleCases?: boolean;
}

export type ParsingResult =
  | { ok: Node; simple: boolean }
  | { error: ParsingError };

export function parse(code: string, opts?: ParseOptions): ParsingResult {
  code = convertTextToHalfWidth(code);

  if (opts?.optimizesForSimpleCases ?? true) {
    const result = simpleParse(code);
    if (result) return { ok: result, simple: true };
  }

  const tree = lezerParser.parse(code);
  const transformer = new Transformer(tree, code);
  try {
    return { ok: transformer.transform(), simple: false };
  } catch (e) {
    if (e instanceof ParsingError) return { error: e };
    throw e;
  }
}
