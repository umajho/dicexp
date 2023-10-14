import { Node } from "@dicexp/nodes";
import {
  callCallable,
  createValue,
  createValueBox,
  getTypeDisplayName,
  getValueTypeName,
  makeRuntimeError,
  RandomGenerator,
  Scope,
  ValueBox,
} from "@dicexp/runtime/values";
import { RuntimeProxy, RuntimeReporter } from "./runtime";
import {
  flattenListAll,
  unwrapList,
  unwrapListOneOf,
} from "@dicexp/runtime/value-utils";

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
    makeRuntimeError,
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
