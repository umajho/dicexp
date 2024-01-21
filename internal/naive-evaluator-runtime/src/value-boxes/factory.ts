import { createRepr, ReprInRuntime } from "../repr/mod";
import { RuntimeError } from "../runtime-errors/mod";
import { Value, Value_Container, Value_Direct } from "../values/mod";

import { ValueBox } from "./ValueBox";
import {
  ValueBoxContainer,
  ValueBoxDircet,
  ValueBoxError,
  ValueBoxLazy,
  valueBoxUnevaluated,
} from "./impl";

export const createValueBox = {
  direct(
    value: Value_Direct,
    repr: ReprInRuntime = createRepr.value(value),
  ) {
    return new ValueBoxDircet(value, repr);
  },

  container(
    list: Value_Container,
    repr: ReprInRuntime = createRepr.value(list),
  ) {
    return new ValueBoxContainer(list, repr);
  },

  value(
    value: Value,
    repr: ReprInRuntime = createRepr.value(value),
  ) {
    if (
      typeof value === "object" &&
      (value.type === "list" || value.type === "stream$list" ||
        value.type === "stream$sum")
    ) {
      return createValueBox.container(value, repr);
    }
    return createValueBox.direct(value, repr);
  },

  error(
    error: RuntimeError,
    opts?: { indirect?: boolean; source?: ReprInRuntime },
  ) {
    return new ValueBoxError(error, opts);
  },

  lazy(yielder?: () => ValueBox) {
    return new ValueBoxLazy(yielder);
  },

  unevaluated() {
    return valueBoxUnevaluated;
  },
};
