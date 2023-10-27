import { makeRuntimeError, RuntimeError } from "./runtime_errors";
import { createRepr, ReprInRuntime } from "./repr/mod";
import { createList } from "./impl/lists";
import { createCallable } from "./impl/callable";
import { createCreateStream } from "./impl/streams";

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

export interface DisposableErrorHookable {
  addDisposableErrorHook(hook: (err: RuntimeError) => void): void;
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
    if (typeof value === "object" && value.type === "list") {
      return createValueBox.list(value, repr);
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

class ValueBoxList extends ValueBox implements DisposableErrorHookable {
  private errorInItem?: RuntimeError;

  constructor(
    private value: Value_List,
    private representation: ReprInRuntime,
  ) {
    super();
    value.addDisposableErrorHook((err) => this.errorInItem = err);
  }

  get(): ["ok", Value] | ["error", RuntimeError] {
    return this.errorInItem ? ["error", this.errorInItem] : ["ok", this.value];
  }
  confirmsError(): boolean {
    return !!this.errorInItem;
  }
  getRepr(): ReprInRuntime {
    return this.representation;
  }

  addDisposableErrorHook(hook: (err: RuntimeError) => void): void {
    this.value.addDisposableErrorHook(hook);
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

class ValueBoxLazy extends ValueBox implements DisposableErrorHookable {
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
        delete this.errorHooks;
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

  addDisposableErrorHook(hook: (err: RuntimeError) => void) {
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
  | Value_Stream;

export const createValue = {
  callable: createCallable,

  list: createList,

  stream$list: createCreateStream("stream$list"),

  stream$sum: createCreateStream("stream$sum"),
};

export { asCallable, callCallable } from "./impl/callable";

export interface Value_Callable {
  type: "callable";
  arity: number;
  _call: (args: ValueBox[]) => ValueBox;

  representation: ReprInRuntime;
}

export type Value_List = ValueBox[] & {
  type: "list";
  addDisposableErrorHook(hook: (err: RuntimeError) => void): void;
  confirmsThatContainsError(): boolean;
};

export type Value_Stream = Value_Stream$List | Value_Stream$Sum;

interface Value_StreamBase<Type extends string, T> {
  type: Type;

  /**
   * 访问指定位置的值。
   */
  _at: (
    index: number,
  ) => [
    | "ok"
    | /* 名义上后面不再有值 */ "last_nominal"
    | /* 实际上后面不再有值 */ "last",
    T,
  ] | null;

  /**
   * 获取可能的最小的名义上的长度。
   */
  _getMinimalPossibleNominalLength: () => number | undefined;

  /**
   * 获取实际产生的长度。
   */
  _getActualLength: () => number;

  /**
   * 访问与指定位置的值关联的片段。
   *
   * 只应该在创建 repr 的时候调用，这时所需获取的元素都已经填充好了。
   */
  _fragmentAtForRepr: (index: number) => StreamFragment<T>;
}

export type StreamFragment<T> = [
  /**
   * 留下的元素。
   */
  kept: [type: "regular", value: T],
  /**
   * 在上一个留下的元素与这次留下的元素之间的被遗弃（如在 reroll、filter 时）的元素。
   */
  abandonedBefore?: T[],
];

/**
 * 可以隐式转换为列表的流。
 */
export type Value_Stream$List = Value_StreamBase<"stream$list", ValueBox>;
/**
 * 可以隐式转换为整数（通过求和）的流。
 */
export type Value_Stream$Sum = Value_StreamBase<"stream$sum", number>;

export function asInteger(value: Value): number | null {
  if (typeof value === "number") return value;

  if (
    typeof value === "object" && !Array.isArray(value) &&
    value.type === "stream$sum"
  ) {
    let sum = 0;
    for (let i = 0;; i++) {
      const result = value._at(i);
      if (!result) break;
      sum += result[1];
      if (result[0] === "last" || result[0] === "last_nominal") break;
    }
    return sum;
  }

  return null;
}

export function asList(value: Value): Value_List | null {
  if (typeof value === "object" && value.type === "list") return value;

  if (typeof value === "object" && value.type === "stream$list") {
    const list = //
      new Array<ValueBox>(value._getMinimalPossibleNominalLength() ?? 0);
    for (let i = 0;; i++) {
      const result = value._at(i);
      if (!result) break;
      list[i] = result[1];
      if (result[0] === "last" || result[0] === "last_nominal") break;
    }
    return createValue.list(list);
  }

  return null;
}

export function asPlain(
  value: Value,
): Exclude<Value, Value_Stream> {
  if (typeof value !== "object") return value;

  const integer = asInteger(value);
  if (integer !== null) return integer;

  const list = asList(value);
  if (list !== null) return list;

  return value as Exclude<Value, Value_Stream>;
}
