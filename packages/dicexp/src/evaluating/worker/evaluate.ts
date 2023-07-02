import { functionScope, operatorScope } from "@dicexp/builtins/internal";
import { EvaluateOptionsForWorker, ExecuteOptionsForWorker } from "./types";
import { Unreachable } from "@dicexp/errors";
import { execute, ExecuteOptions } from "../../executing/mod";
import { Node } from "@dicexp/nodes";
import { evaluate } from "../evaluate";
import { Scope } from "@dicexp/runtime/values";
import { asScope } from "@dicexp/runtime/regular-functions";

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
    topLevelScope: getScopeCollection(opts.execute.topLevelScopeName),
    restrictions: opts.restrictions?.execute,
    seed: opts.execute.seed,
  };
}

function getScopeCollection(
  scopeName: ExecuteOptionsForWorker["topLevelScopeName"],
): Scope {
  switch (scopeName) {
    case "barebones":
      return operatorScope;
    case "standard":
      return asScope([operatorScope, functionScope]);
    default:
      throw new Unreachable();
  }
}