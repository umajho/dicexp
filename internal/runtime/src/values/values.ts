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

interface DisposableErrorHookable {
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
  callable(
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
  },

  list(underlying: ValueBox[]): Value_List {
    InternalValue_List.creating = true;
    const v = new InternalValue_List(...underlying);
    InternalValue_List.creating = false;
    return v as Value_List;
  },

  /**
   * TODO: DRY with `stream$sum`.
   */
  stream$list(
    nominalLength: number,
    yielder: () => ValueBox,
  ): Value_Stream$List {
    const underlying: ValueBox[] = Array(nominalLength);
    let filled = 0;
    return {
      type: "stream$list",
      nominalLength,
      _at(index: number) {
        for (let unfilledI = filled; unfilledI <= index; unfilledI++) {
          underlying[unfilledI] = yielder();
        }
        if (filled <= index) {
          filled = index + 1;
        }
        return underlying[index];
      },
    };
  },

  stream$sum(
    nominalLength: number,
    yielder: () => number,
  ): Value_Stream$Sum {
    const underlying: number[] = Array(nominalLength);
    let filled = 0;
    return {
      type: "stream$sum",
      nominalLength,
      _at(index: number) {
        for (let unfilledI = filled; unfilledI <= index; unfilledI++) {
          if (!underlying[unfilledI]) {
            underlying[unfilledI] = yielder();
          }
        }
        filled = index + 1;
        return underlying[index];
      },
      _getAddends() {
        return underlying.slice(0, filled);
      },
    };
  },
};

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

export type Value_List = ValueBox[] & {
  type: "list";
  addDisposableErrorHook(hook: (err: RuntimeError) => void): void;
  confirmsThatContainsError(): boolean;
};
/**
 * XXX: 在外部，其只允许通过 `createValue` 工厂来创建，以保证实现细节不会暴露。
 */
class InternalValue_List extends Array<ValueBox> implements Value_List {
  /**
   * 之前尝试用 Proxy 实现 `Value_List`，但是开销太大了，故还是决定换成现在的继承 Array 来
   * 实现。
   * 由于 JavaScript 在调用 map 之类的方法时，创建新数组用的是继承后的 constructor，这里
   * 通过 `creating` 这个 workaround 来确定创建者的来源。其为 false 代表来源并非
   * `createValue` 工厂，这时不会有任何多余的逻辑。
   */
  static creating = false;

  type!: "list";

  private confirmedError?: RuntimeError | null = null;
  private errorHooks?: ((err: RuntimeError) => void)[];

  constructor(...underlying: ValueBox[]) {
    super(...underlying);

    if (!InternalValue_List.creating) return;

    this.type = "list";
    this.confirmedError = null;

    const setComfirmedError = (err: RuntimeError) => {
      this.confirmedError = err;
      this.errorHooks?.forEach((hook) => hook(err));
      delete this.errorHooks;
    };

    for (const item of underlying) {
      if (this.confirmedError) break;
      if (item.confirmsError()) {
        const itemResult = item.get();
        if (itemResult[0] !== "error") throw new Unreachable();
        setComfirmedError(itemResult[1]);
      } else if ("addDisposableErrorHook" in item) {
        (item as DisposableErrorHookable)
          .addDisposableErrorHook((err) => setComfirmedError(err));
      }
    }
  }

  /**
   * 在确定有错误时，以该错误为参数调用 hook。
   */
  addDisposableErrorHook(hook: (err: RuntimeError) => void): void {
    if (this.confirmedError) {
      hook(this.confirmedError);
    } else if (this.errorHooks) {
      this.errorHooks.push(hook);
    } else {
      this.errorHooks = [hook];
    }
  }

  confirmsThatContainsError(): boolean {
    return !!this.confirmedError;
  }
}

export type Value_Stream = Value_Stream$List | Value_Stream$Sum;
/**
 * 可以隐式转换为列表的流。
 */
export interface Value_Stream$List {
  type: "stream$list";

  /**
   * 名义上的长度，在转换成其他类型时只截取至这里。
   *
   * 比如，`5#d3` 的名义长度是 5，`3d6` 的名义长度是 3。
   */
  nominalLength: number;

  /**
   * 直接访问指定位置的值。
   */
  _at: (index: number) => ValueBox;
}
/**
 * 可以隐式转换为整数（通过求和）的流。
 */
export interface Value_Stream$Sum {
  type: "stream$sum";

  /**
   * 名义上的长度，在转换成其他类型时只截取至这里。
   *
   * 比如，`5#d3` 的名义长度是 5，`3d6` 的名义长度是 3。
   */
  nominalLength: number;

  /**
   * 直接访问指定位置的值。
   */
  _at: (index: number) => number;

  _getAddends: () => number[];
}

export function asInteger(value: Value): number | null {
  if (typeof value === "number") return value;

  if (
    typeof value === "object" && !Array.isArray(value) &&
    value.type === "stream$sum"
  ) {
    let sum = 0;
    for (let i = 0; i < value.nominalLength; i++) {
      sum += value._at(i);
    }
    return sum;
  }

  return null;
}

export function asList(value: Value): Value_List | null {
  if (typeof value === "object" && value.type === "list") return value;

  if (typeof value === "object" && value.type === "stream$list") {
    const list = new Array<ValueBox>(value.nominalLength);
    for (let i = 0; i < value.nominalLength; i++) {
      list[i] = value._at(i);
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
