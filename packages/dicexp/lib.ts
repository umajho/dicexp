export * from "@dicexp/parsing";
export * from "@dicexp/executing";

import { parse } from "@dicexp/parsing";
import {
  execute,
  type ExecuteOptions,
  type ExecutionResult,
} from "@dicexp/executing";

export function evaluate(
  code: string,
  opts: ExecuteOptions = {},
): ExecutionResult {
  const node = parse(code, opts.parseOpts);
  return execute(node, opts);
}
