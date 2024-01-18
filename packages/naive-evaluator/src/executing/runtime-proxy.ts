import { Node } from "@dicexp/nodes";
import { createRuntimeError } from "@dicexp/runtime/runtime-errors";
import { RandomGenerator } from "@dicexp/runtime/types";
import {
  callCallable,
  createValue,
  getTypeDisplayName,
  getValueTypeName,
} from "@dicexp/runtime/values";
import { createValueBox, ValueBox } from "@dicexp/runtime/value-boxes";
import { Scope } from "@dicexp/runtime/scopes";
import {
  flattenListAll,
  unwrapList,
  unwrapListOneOf,
} from "@dicexp/runtime/utils";

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
