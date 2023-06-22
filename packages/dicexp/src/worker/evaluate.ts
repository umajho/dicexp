import { barebonesScope, standardScope } from "@dicexp/builtins";
import { EvaluateOptionsForWorker, ExecuteOptionsForWorker } from "./types";
import { Unreachable } from "@dicexp/errors";
import { execute, ExecuteOptions } from "@dicexp/executing";
import { Node } from "@dicexp/nodes";
import { evaluate } from "../evaluate";

export function executeForWorker(node: Node, opts: ExecuteOptionsForWorker) {
  return execute(node, convertExecuteOpts(opts));
}

export function evaluateForWorker(
  code: string,
  opts: EvaluateOptionsForWorker,
) {
  return evaluate(code, {
    execute: convertExecuteOpts(opts.execute),
    parse: opts.parse,
  });
}

function convertExecuteOpts(opts: ExecuteOptionsForWorker): ExecuteOptions {
  const topLevelScope = getScope(opts.topLevelScopeName);
  return {
    topLevelScope,
    restrictions: opts.restrictions,
    seed: opts.seed,
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
