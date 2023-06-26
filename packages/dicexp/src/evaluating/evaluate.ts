import { parse, type ParseOptions } from "../parsing/mod";
import {
  execute,
  type ExecuteOptions,
  type RuntimeError,
  type RuntimeStatistics,
} from "../executing/mod";
import type { JSValue, Representation } from "../executing/mod";

export interface EvaluateOptions {
  execute: ExecuteOptions;
  parse?: ParseOptions;
}

export type EvaluationResult = {
  ok: JSValue;
  error?: never;
  representation: Representation;
  statistics: RuntimeStatistics;
} | {
  ok?: never;
  error: Error | RuntimeError;
  representation?: Representation;
  statistics?: RuntimeStatistics;
};

export function evaluate(
  code: string,
  opts: EvaluateOptions,
): EvaluationResult {
  const parseResult = parse(code, opts.parse);
  if ("error" in parseResult) {
    return { error: parseResult.error };
  }
  return execute(parseResult.ok, opts.execute);
}
