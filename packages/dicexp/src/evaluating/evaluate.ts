import {
  BasicEvaluationOptions,
  BasicEvaluationResult,
} from "@dicexp/interface";

import {
  parse,
  ParseError,
  ParseOptions,
} from "@dicexp/parsing-into-node-tree";

import {
  execute,
  ExecutionAppendix,
  ExecutionOptions,
  RuntimeError,
} from "@dicexp/node-tree-walk-interpreter";

export interface EvaluationOptions
  extends BasicEvaluationOptions<ParseOptions, ExecutionOptions> {
  execution: ExecutionOptions;
  parse?: ParseOptions;
}

export type EvaluationResult = //
  BasicEvaluationResult<ParseError, ExecutionAppendix, RuntimeError>;

export function evaluate(
  code: string,
  opts: EvaluationOptions,
): EvaluationResult {
  const parseResult = parse(code, opts.parse);
  if (parseResult[0] === "error") return ["error", "parse", parseResult[1]];
  // parseResult[0] === "ok"
  const node = parseResult[1];

  const result = execute(node, opts.execution);
  if (result[0] === "ok") {
    return result;
  } else { // result[0] === "error" && result[1] === "runtime"
    return ["error", result[1], result[2], result[3]];
  }
}
