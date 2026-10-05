import {
  defineBaseFunctionsSuite,
  SuiteContext,
} from "@dicexp/test-utils-for-executing";

import { makeTester, makeTesterFor } from "./utils";

import { builtinScope } from "../lib";

const ctx: SuiteContext = {
  impl: "naive",
  // base/functions 的各行均按名字各自构建 tester；此默认 tester 未被用到，
  // 但对上下文而言是必要的。
  tester: makeTester({ topLevelScope: builtinScope }),
  makeTesterFor,
};

defineBaseFunctionsSuite(ctx);
