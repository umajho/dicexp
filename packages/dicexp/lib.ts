export * from "@dicexp/parsing";
export * from "@dicexp/executing";

import { parse, type ParseOptions } from "@dicexp/parsing";
import {
  execute,
  type ExecuteOptions,
  type ExecutionResult,
} from "@dicexp/executing";

type EvaluateOptions = ExecuteOptions & {
  parseOpts?: ParseOptions;
};

export function evaluate(
  code: string,
  opts: EvaluateOptions = {},
): ExecutionResult {
  const node = parse(code, opts.parseOpts);
  return execute(node, opts);
}
