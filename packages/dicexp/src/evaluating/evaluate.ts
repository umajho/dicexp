import {
  parse,
  ParseOptions,
  ParsingError,
} from "@dicexp/parsing-into-node-tree";

import {
  execute,
  ExecuteOptions,
  ExecutionAppendix,
  JSValue,
  RuntimeError,
} from "@dicexp/node-tree-walk-interpreter";

export interface EvaluateOptions {
  execute: ExecuteOptions;
  parse?: ParseOptions;
}

export type EvaluationResult =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "parse", ParsingError]
  | ["error", "other", Error]
  | ["error", "runtime", RuntimeError, ExecutionAppendix];

export function evaluate(
  code: string,
  opts: EvaluateOptions,
): EvaluationResult {
  const parseResult = parse(code, opts.parse);
  if (parseResult[0] === "error") return ["error", "parse", parseResult[1]];
  // parseResult[0] === "ok"
  const node = parseResult[1];

  const result = execute(node, opts.execute);
  if (result[0] === "ok") {
    return result;
  } else { // result[0] === "error" && result[1] === "runtime"
    return ["error", result[1], result[2], result[3]];
  }
}
