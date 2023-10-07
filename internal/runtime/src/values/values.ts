import { makeRuntimeError, RuntimeError } from "./runtime_errors";
import { createRepr, ReprInRuntime } from "./repr/mod";
import { Unreachable } from "@dicexp/errors";

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

export const createValueBox = {
  direct(
    value: Value_NonContainer,
    repr: ReprInRuntime = createRepr.value(value),
  ) {
    return new ValueBoxDircet(value, repr);
  },

  list(
    list: Value_List,
    repr: ReprInRuntime = createRepr.value(list),
  ) {
    return new ValueBoxList(list, repr);
  },

  value(
    value: Value,
    repr: ReprInRuntime = createRepr.value(value),
  ) {
    if (Array.isArray(value)) return createValueBox.list(value, repr);
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

class ValueBoxDircet extends ValueBox {
  constructor(
    private value: Value_NonContainer,
    private representation: ReprInRuntime,
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

class ValueBoxList extends ValueBox {
  private errorInItem?: RuntimeError;

  constructor(
    private value: Value_List,
    private representation: ReprInRuntime,
  ) {
    super();
    for (const item of value) {
      if (item.confirmsError()) {
        const itemResult = item.get();
        if (itemResult[0] !== "error") throw new Unreachable();
        this.errorInItem = itemResult[1];
        break;
      } else if (item instanceof ValueBoxLazy) {
        item.addErrorHook((err) => this.errorInItem = err);
      }
    }
  }

  get(): ["ok", Value] | ["error", RuntimeError] { // TODO
    return this.errorInItem ? ["error", this.errorInItem] : ["ok", this.value];
  }
  confirmsError(): boolean { // TODO
    return !!this.errorInItem;
  }
  getRepr(): ReprInRuntime { // TODO
    return this.representation;
  }
}

class ValueBoxError extends ValueBox {
  private repr: ReprInRuntime;

  constructor(
    private error: RuntimeError,
    opts?: { indirect?: boolean; source?: ReprInRuntime },
  ) {
    super();

    this.repr = opts?.indirect
      ? (opts.source ?? createRepr.error_indirect())
      : createRepr.error(error, opts?.source);
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

class ValueBoxLazy extends ValueBox {
  memo?: [["ok", Value] | ["error", RuntimeError], ReprInRuntime];
  errorHooks?: ((err: RuntimeError) => void)[];

  constructor(
    private yielder?: () => ValueBox,
  ) {
    super();
  }

  get(): ["ok", Value] | ["error", RuntimeError] {
    if (!this.memo) {
      const valueBox = this.yielder!();
      delete this.yielder;
      const result = valueBox.get();
      this.memo = [result, valueBox.getRepr()];
      if (result[0] === "error") {
        this.errorHooks?.forEach((h) => h(result[1]));
      }
    }
    return this.memo[0];
  }
  confirmsError(): boolean {
    if (!this.memo) return false;
    return this.memo[0][0] === "error";
  }
  getRepr(): ReprInRuntime {
    if (this.memo) {
      return this.memo[1];
    }
    return createRepr.unevaluated();
  }

  addErrorHook(hook: (err: RuntimeError) => void) {
    if (this.memo?.[0][0] === "error") {
      hook(this.memo[0][1]);
    } else if (this.errorHooks) {
      this.errorHooks.push(hook);
    } else {
      this.errorHooks = [hook];
    }
  }
}

class ValueBoxUnevaluated extends ValueBox {
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
const valueBoxUnevaluated = new ValueBoxUnevaluated();

export type Value =
  | Value_NonContainer
  | Value_List;
/**
 * 没有更内部内容的值。
 * 用这样的值创建 ValueBox 时不用检查内部是否存在错误。
 */
export type Value_NonContainer =
  | number
  | boolean
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
