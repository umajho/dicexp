import { EvaluationTester } from "@dicexp/test-utils-for-executing";

import {
  Evaluator,
  NewEvaluatorOptions,
} from "@dicexp/naive-evaluator/internal";

import { ScopeExplicit } from "../src/types";

export function makeTester(
  opts:
    & Partial<NewEvaluatorOptions>
    & Pick<NewEvaluatorOptions, "topLevelScope">,
): EvaluationTester {
  return new EvaluationTester(
    new Evaluator({
      randomSourceMaker: "xorshift7",
      ...opts,
    }),
  );
}

export function scopeWith<T extends string, U extends T>(
  scope: ScopeExplicit<{ [ident in T]: any }>,
  pickedNames: readonly U[],
) {
  const newScope: ScopeExplicit<{ [ident in string]: any }> = {};
  for (const name of pickedNames) {
    newScope[name] = scope[name];
  }
  return newScope as ScopeExplicit<{ [ident in U]: any }>;
}
