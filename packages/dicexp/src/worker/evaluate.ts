import { barebonesScope, standardScope } from "@dicexp/builtins";
import { EvaluateOptionsForWorker, ExecuteOptionsForWorker } from "./types";
import { Unreachable } from "@dicexp/errors";
import { execute, ExecuteOptions } from "@dicexp/executing";
import { Node } from "@dicexp/nodes";
import { evaluate } from "../evaluate";

export function executeForWorker(node: Node, opts: ExecuteOptions) {
  return execute(node, opts);
}

export function evaluateForWorker(
  code: string,
  opts: EvaluateOptionsForWorker,
) {
  return evaluate(code, {
    execute: makeExecuteOptions(opts),
    parse: opts.parse,
  });
}

export function makeExecuteOptions(
  opts: EvaluateOptionsForWorker,
): ExecuteOptions {
  return {
    topLevelScope: getScope(opts.execute.topLevelScopeName),
    restrictions: opts.restrictions?.execute,
    seed: opts.execute.seed,
  };
}

function getScope(
  scopeName: ExecuteOptionsForWorker["topLevelScopeName"],
) {
  switch (scopeName) {
    case "barebones":
      return barebonesScope;
    case "standard":
      return standardScope;
    default:
      throw new Unreachable();
  }
}
