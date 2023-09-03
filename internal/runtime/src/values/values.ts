import { makeRuntimeError, RuntimeError } from "./runtime_errors";
import { createRepr, ReprInRuntime } from "./repr/mod";

export abstract class ValueBox {
  /**
   * 获取其中的值。对于惰性的 ValueBox 而言，在此时才求值。
   */
  abstract get(): ["ok", Value] | ["error", RuntimeError];
  /**
   * 是否确定存在错误。
   */
  abstract confirmsError(): boolean;
  abstract getRepr(): ReprInRuntime;
}

export class ValueBoxDircet extends ValueBox {
  constructor(
    private value: Value,
    private representation: ReprInRuntime = createRepr.value(value),
  ) {
    super();
  }

  get(): ["ok", Value] {
    return ["ok", this.value];
  }
  confirmsError(): boolean {
    return false;
  }
  getRepr(): ReprInRuntime {
    return this.representation;
  }
}

export class ValueBoxError extends ValueBox {
  private repr: ReprInRuntime;

  constructor(
    private error: RuntimeError,
    opts?: {
      deep?: boolean;
      source?: ReprInRuntime;
    },
  ) {
    super();

    this.repr = createRepr.error(
      opts?.deep ? "deep" : "direct",
      error,
      opts?.source,
    );
  }

  get(): ["error", RuntimeError] {
    return ["error", this.error];
  }
  confirmsError(): boolean {
    return true;
  }
  getRepr(): ReprInRuntime {
    return this.repr;
  }
}

export class ValueBoxLazy extends ValueBox {
  memo?: [["ok", Value] | ["error", RuntimeError], ReprInRuntime];

  constructor(
    private yielder?: () => ValueBox,
  ) {
    super();
  }

  get(): ["ok", Value] | ["error", RuntimeError] {
    if (!this.memo) {
      const valueBox = this.yielder!();
      delete this.yielder;
      this.memo = [valueBox.get(), valueBox.getRepr()];
    }
    return this.memo[0];
  }
  confirmsError(): boolean {
    if (!this.memo) return false;
    return !!this.memo[1];
  }
  getRepr(): ReprInRuntime {
    if (this.memo) {
      return this.memo[1];
    }
    return createRepr.unevaluated();
  }
}

export class ValueBoxUnevaluated extends ValueBox {
  get(): ["error", RuntimeError] {
    return ["error", makeRuntimeError("未求值（实现细节泄漏）")];
  }
  confirmsError(): boolean {
    return true;
  }
  getRepr(): ReprInRuntime {
    return createRepr.unevaluated();
  }
}

export type Value =
  | number
  | boolean
  | Value_List
  | Value_Callable
  | Value_List$Extendable
  | Value_Integer$SumExtendable;

export type Value_List = ValueBox[];

export interface Value_Callable {
  type: "callable";
  arity: number;
  _call: (args: ValueBox[]) => ValueBox;

  representation: ReprInRuntime;
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

export interface Value_Extendable {
  nominalLength: number;
  _at: (index: number) => ValueBox;
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
