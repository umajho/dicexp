export * from "@dicexp/parsing";
export * from "@dicexp/executing";

import { parse, type ParseOptions } from "@dicexp/parsing";
import { execute, type ExecuteOptions } from "@dicexp/executing";
import type { JSValue } from "@dicexp/executing/src/runtime";
import type { Representation } from "@dicexp/executing/src/values";

export type EvaluateOptions = ExecuteOptions & {
  parseOpts?: ParseOptions;
};

export type EvaluationResult = {
  ok: JSValue;
  error?: never;
  representation: Representation;
} | {
  ok?: never;
  error: Error;
  representation: Representation | null; // 不一定有
};

export function evaluate(
  code: string,
  opts: EvaluateOptions = {},
): EvaluationResult {
  const parseResult = parse(code, opts.parseOpts);
  if ("error" in parseResult) {
    return { error: parseResult.error, representation: null };
  }
  return execute(parseResult.ok, opts);
}
