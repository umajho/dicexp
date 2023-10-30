import { createRuntimeError } from "../runtime-errors/factory";
import {
  flattenListAll,
  unwrapList,
  unwrapListOneOf,
} from "../utils/unwrapping";
import {
  callCallable,
  createValue,
  getTypeDisplayName,
  getValueTypeName,
} from "../values/mod";
import { createValueBox } from "../value-boxes/mod";
import { RandomGenerator } from "../types";

export interface RuntimeProxyForFunction {
  random: RandomGenerator;

  createValue: typeof createValue;
  createValueBox: typeof createValueBox;
  createRuntimeError: typeof createRuntimeError;

  callCallable: typeof callCallable;

  getValueTypeName: typeof getValueTypeName;
  getTypeDisplayName: typeof getTypeDisplayName;

  utils: {
    flattenListAll: typeof flattenListAll;
    unwrapList: typeof unwrapList;
    unwrapListOneOf: typeof unwrapListOneOf;
  };
}
