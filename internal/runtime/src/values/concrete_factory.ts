import {
  representError,
  representValue,
  RuntimeRepresentation,
} from "./representations/mod";
import { RuntimeError } from "./runtime_errors";
import { Concrete, Value } from "./values";

export function concrete_literal(value: Value): Concrete {
  return {
    value: { ok: value },
    representation: representValue(value),
  };
}

export function concrete_error(
  error: RuntimeError,
  source?: RuntimeRepresentation,
): Concrete {
  return {
    value: { error: error },
    representation: source
      ? ["(", ...source, "=>", representError(error), ")"]
      : representError(error),
  };
}
