import type * as I from "@dicexp/interface";

import { Node } from "@dicexp/nodes";
import { Scope } from "@dicexp/naive-evaluator-runtime/scopes";

import { ExecutionResult, Runtime } from "./runtime";
import { RandomSource } from "./random";
export type { ExecutionResult } from "./runtime";

export interface ExecutionOptions {
  topLevelScope: Scope;
  restrictions?: I.ExecutionRestrictions;
  randomSource: RandomSource;
}

/**
 * @param node
 * @param opts
 * @returns
 */
export const execute = //
  (node: Node, opts: ExecutionOptions): ExecutionResult => {
    const restrictions = opts.restrictions ?? {};

    const runtime = new Runtime(node, {
      topLevelScope: opts.topLevelScope,
      randomSource: opts.randomSource,
      restrictions,
    });
    return runtime.execute();
  };
