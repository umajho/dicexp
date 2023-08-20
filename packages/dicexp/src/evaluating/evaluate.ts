import { parse, ParseOptions } from "../parsing/mod";
import { execute, ExecuteOptions, RuntimeError } from "../executing/mod";
import { JSValue } from "../executing/mod";
import { ExecutionAppendix } from "../executing/runtime";

export interface EvaluateOptions {
  execute: ExecuteOptions;
  parse?: ParseOptions;
}

export type EvaluationResult =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "parse" | "other", Error]
  | ["error", "execute", RuntimeError, ExecutionAppendix];

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
  } else { // result[0] === "error"
    return ["error", "execute", result[1], result[2]];
  }
}
