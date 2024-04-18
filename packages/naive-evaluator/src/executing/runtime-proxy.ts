import { Node } from "@dicexp/nodes";
import { createRuntimeError } from "@dicexp/naive-evaluator-runtime/runtime-errors";
import { RandomGenerator } from "@dicexp/naive-evaluator-runtime/types";
import {
  callCallable,
  createValue,
  getTypeDisplayName,
  getValueTypeName,
} from "@dicexp/naive-evaluator-runtime/values";
import {
  createValueBox,
  ValueBox,
} from "@dicexp/naive-evaluator-runtime/value-boxes";
import { Scope } from "@dicexp/naive-evaluator-runtime/scopes";
import {
  flattenListAll,
  unwrapList,
  unwrapListOneOf,
} from "@dicexp/naive-evaluator-runtime/utils";

import { RuntimeProxy, RuntimeReporter } from "./runtime";

export function createRuntimeProxy(opts: {
  random: RandomGenerator;
  interpret: (scope: Scope, node: Node) => ValueBox;
  reporter: RuntimeReporter;
}): RuntimeProxy {
  const { random, interpret, reporter } = opts;

  return {
    random,
    createValue,
    createValueBox,
    createRuntimeError,
    callCallable,
    getValueTypeName,
    getTypeDisplayName,
    utils: {
      flattenListAll,
      unwrapList,
      unwrapListOneOf,
    },

    interpret,
    reporter,
  };
}
