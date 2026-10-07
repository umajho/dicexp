import { EvaluationTester } from "@dicexp/test-utils-for-executing";

import {
  Evaluator,
  NewEvaluatorOptions,
} from "@dicexp/naive-evaluator/internal";

import { builtinScope, functionScope, operatorScope } from "../lib";
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

/**
 * Builds a tester whose top-level scope resolves (at least) the given
 * builtins — 先挑函数作用域中的，再挑运算符作用域中的（与原先各测试
 * 文件中构建作用域的顺序一致）。
 */
export function makeTesterFor(names: readonly string[]): EvaluationTester {
  const pick = (scope: Record<string, unknown>) =>
    Object.fromEntries(
      names.filter((n) => n in scope).map((n) => [n, (scope as any)[n]]),
    );
  return makeTester({
    topLevelScope: {
      ...pick(functionScope),
      ...pick(operatorScope),
    },
  });
}
