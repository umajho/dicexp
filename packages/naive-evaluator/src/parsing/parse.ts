import { Node } from "@dicexp/nodes";

import { parser as lezerParser } from "@dicexp/lezer";

import { convertTextToHalfWidth } from "./utils";
import { Transformer } from "./transformer";
import { ParseError } from "./parse_error";

export interface ParseOptions {}

export type ParseResult =
  | ["ok", Node]
  | ["error", ParseError];

export const parse = //
  (code: string, _opts?: ParseOptions): ParseResult => {
    code = convertTextToHalfWidth(code);

    const tree = lezerParser.parse(code);
    const transformer = new Transformer(tree, code);
    return transformer.transform();
  };
