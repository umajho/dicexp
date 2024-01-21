import { Value, Value_Plain } from "./types";

export function castImplicitly(value: Value): Value_Plain {
  while (typeof value === "object" && "castImplicitly" in value) {
    value = value.castImplicitly();
  }
  return value;
}

export function asInteger(value: Value): number | null {
  value = asPlain(value);
  return typeof value === "number" ? value : null;
}

export function asPlain(
  value: Value,
): Value_Plain {
  if (typeof value !== "object") return value;
  if ("castImplicitly" in value) return value.castImplicitly();
  return value;
}
