import { parse, type ParseOptions } from "@dicexp/parsing";
import {
  execute,
  type ExecuteOptions,
  type RuntimeError,
  type RuntimeStatistics,
} from "@dicexp/executing";
import type { JSValue } from "@dicexp/executing/src/runtime";
import type { Representation } from "@dicexp/executing";

export type EvaluateOptions = ExecuteOptions & {
  parseOpts?: ParseOptions;
};

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
  opts: EvaluateOptions = {},
): EvaluationResult {
  const parseResult = parse(code, opts.parseOpts);
  if ("error" in parseResult) {
    return { error: parseResult.error };
  }
  return execute(parseResult.ok, opts);
}
