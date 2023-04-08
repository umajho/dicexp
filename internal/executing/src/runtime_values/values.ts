import type { RuntimeError } from "./runtime_errors";
import type { RuntimeRepresentation } from "./representations";

export type RuntimeResult<OkType> =
  | { ok: OkType }
  | { error: RuntimeError };

export interface LazyValue {
  /**
   * 对于结果本身不变的或者被固定下来的 LazyValue 而言，固定的值会记录在这里。
   */
  memo?: Concrete | false;
  /**
   * 用于求其值的函数，如果已经有 memo 则可以不存在。
   */
  _yield?: () => Concrete | { lazy: LazyValue };

  /**
   * 是否已经固定下来。
   * 会考虑 memo 是列表时，列表内部（包括嵌套）的值是否也固定下来了。
   */
  stabilized?: true;

  /**
   * 是否被其他其他的 LazyValue 替代。（用于步骤展现。）
   */
  replacedBy?: LazyValue;

  /**
   * 固定成了哪些 Concrete。（用于步骤展现。）
   */
  stabilizedAs?: Concrete[];
}

export type LazyValueWithMemo = LazyValue & {
  memo: Concrete;
};

export interface Concrete {
  value: RuntimeResult<Value>;
  volatile: boolean;
  representation: RuntimeRepresentation;
}

export type Value =
  | number
  | boolean
  | Value_List
  | Value_Callable
  | Value_List$Extendable
  | Value_Integer$SumExtendable;

export type Value_List = LazyValue[];

export interface Value_Callable {
  type: "callable";
  arity: number;
  _call: (args: LazyValue[]) => RuntimeResult<LazyValue>;

  representation: RuntimeRepresentation;
}

export function callCallable(
  callable: Value_Callable,
  args: LazyValue[],
): RuntimeResult<LazyValue> {
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

export interface Value_Extendable {
  nominalLength: number;
  _at: (index: number) => LazyValue;
}

export interface Value_Integer$SumExtendable extends Value_Extendable {
  type: "integer$sum_extendable";

  _sum(): number;
}

export function asInteger(value: Value): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (
    typeof value === "object" && !Array.isArray(value) &&
    "_sum" in value
  ) {
    return value._sum();
  }
  return null;
}

export interface Value_List$Extendable extends Value_Extendable {
  type: "list$extendable";
  _asList: () => Value_List;
}

export function asList(value: Value): Value_List | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && "_asList" in value) {
    return value._asList();
  }
  return null;
}

export function asPlain(
  value: Value,
): Exclude<Value, Value_Integer$SumExtendable | Value_List$Extendable> {
  if (typeof value !== "object" || Array.isArray(value)) return value;
  if ("_sum" in value) return value._sum();
  if ("_asList" in value) return value._asList();
  return value;
}
