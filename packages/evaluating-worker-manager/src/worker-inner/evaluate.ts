import type { ExecutionOptions } from "dicexp/internal";
import type { Scope } from "@dicexp/runtime/scopes";
import type { Node } from "@dicexp/nodes";
import { Unreachable } from "@dicexp/errors";

import { getDicexp } from "./dicexp";
import { EvaluationOptionsForWorker } from "./types";

export class Evaluator<AvailableScopes extends Record<string, Scope>> {
  constructor(
    private availableScopes: AvailableScopes,
  ) {}

  execute(node: Node, opts: ExecutionOptions) {
    return getDicexp().execute(node, opts);
  }

  evaluate(
    code: string,
    opts: EvaluationOptionsForWorker,
  ) {
    return getDicexp().evaluate(code, {
      execution: this.makeExecutionOptions(opts),
      parse: opts.parse,
    });
  }

  makeExecutionOptions(
    opts: EvaluationOptionsForWorker,
  ): ExecutionOptions {
    return {
      ...opts.execution,
      topLevelScope: this.getScopeCollection(opts.execution.topLevelScope),
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
