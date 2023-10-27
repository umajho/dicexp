import { ReprInRuntime, Value, Value_Callable, ValueBox } from "../mod";

export function createCallable(
  arity: number,
  onCall: (args: ValueBox[]) => ValueBox,
  repr: ReprInRuntime,
): Value_Callable {
  return {
    type: "callable",
    arity,
    _call: onCall,
    representation: repr,
  };
}

export function callCallable(
  callable: Value_Callable,
  args: ValueBox[],
): ValueBox {
  return callable._call(args);
}

export function asCallable(
  value: Value,
): Value_Callable | null {
  if (
    typeof value === "object" && "type" in value &&
    value.type === "callable"
  ) {
    return value;
  }
  return null;
}