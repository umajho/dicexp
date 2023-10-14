import type { ExecuteOptions } from "dicexp/internal";
import type { Scope } from "@dicexp/runtime/values";
import type { Node } from "@dicexp/nodes";
import { Unreachable } from "@dicexp/errors";

import { getDicexp } from "./dicexp";
import { EvaluateOptionsForWorker } from "./types";

export class Evaluator<AvailableScopes extends Record<string, Scope>> {
  constructor(
    private availableScopes: AvailableScopes,
  ) {}

  execute(node: Node, opts: ExecuteOptions) {
    return getDicexp().execute(node, opts);
  }

  evaluate(
    code: string,
    opts: EvaluateOptionsForWorker<AvailableScopes>,
  ) {
    return getDicexp().evaluate(code, {
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
