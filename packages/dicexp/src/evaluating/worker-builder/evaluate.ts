import { Unreachable } from "@dicexp/errors";
import { Scope } from "@dicexp/runtime/values";

import { EvaluateOptionsForWorker } from "./types";
import { execute, ExecuteOptions } from "../../executing/mod";
import { Node } from "@dicexp/nodes";
import { evaluate } from "../evaluate";

export class Evaluator<AvailableScopes extends Record<string, Scope>> {
  constructor(
    private availableScopes: AvailableScopes,
  ) {}

  execute(node: Node, opts: ExecuteOptions) {
    return execute(node, opts);
  }

  evaluate(
    code: string,
    opts: EvaluateOptionsForWorker<AvailableScopes>,
  ) {
    return evaluate(code, {
      execute: this.makeExecuteOptions(opts),
      parse: opts.parse,
    });
  }

  makeExecuteOptions(
    opts: EvaluateOptionsForWorker<AvailableScopes>,
  ): ExecuteOptions {
    return {
      topLevelScope: this.getScopeCollection(opts.execute.topLevelScopeName),
      restrictions: opts.restrictions?.execute,
      seed: opts.execute.seed,
    };
  }

  getScopeCollection(
    scopeName: keyof AvailableScopes,
  ): Scope {
    const scope = this.availableScopes[scopeName];
    if (!scope) throw new Unreachable();
    return scope;
  }
}
