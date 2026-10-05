import {
  defineExecutingSuite,
  EvaluationTester,
  SuiteContext,
} from "@dicexp/test-utils-for-executing";

import { makeFunction } from "@dicexp/naive-evaluator-runtime/regular-functions";
import { asScope, Scope } from "@dicexp/naive-evaluator-runtime/scopes";

import * as builtins from "@dicexp/naive-evaluator-builtins/internal";

import { testScope as topLevelScope } from "./test-scope";
import { Evaluator, NewEvaluatorOptions } from "../../lib";

function makeTester(opts?: Partial<NewEvaluatorOptions>): EvaluationTester {
  return new EvaluationTester(
    new Evaluator({
      topLevelScope,
      randomSourceMaker: "xorshift7",
      ...opts,
    }),
  );
}

function makeTesterFor(names: readonly string[]): EvaluationTester {
  // 顺序（先函数作用域、后运算符作用域）与 builtins 测试中构建作用域的
  // 顺序一致。
  const pick = (scope: Record<string, unknown>) =>
    Object.fromEntries(
      names.filter((n) => n in scope).map((n) => [n, (scope as any)[n]]),
    );
  return makeTester({
    topLevelScope: {
      ...pick(builtins.functionScope),
      ...pick(builtins.operatorScope),
    },
  });
}

function makeSleepTester(): EvaluationTester {
  const scope: Scope = asScope([
    builtins.operatorScope,
    {
      "sleep/1": makeFunction(
        ["integer"],
        (_rtm, ...args) => {
          const [ms] = args as [number];
          const start = performance.now();
          while (performance.now() - start <= ms) { /* noop */ }
          return ["ok", true];
        },
      ),
    },
  ]);
  return makeTester({ topLevelScope: scope });
}

const ctx: SuiteContext = {
  impl: "naive",
  tester: makeTester(),
  makeTesterFor,
  makeSleepTester,
};

defineExecutingSuite(ctx);
