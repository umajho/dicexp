import { makeRuntimeError, RuntimeError } from "./runtime_errors";
import { createRepr, ReprInRuntime } from "./repr/mod";
import { createList } from "./impl/lists";
import { createCallable } from "./impl/callable";
import {
  createStream$list,
  createStream$sum,
  createStreamTransformer,
} from "./impl/streams";
import { ErrorBeacon } from "./error-beacon";

export abstract class ValueBox {
  /**
   * 获取其中的值。对于惰性的 ValueBox 而言，在此时才求值。
   */
  abstract get(): ["ok", Value] | ["error", RuntimeError];
  /**
   * 是否确定存在错误。
   */
  abstract confirmsError(): boolean;
  get errorBeacon(): ErrorBeacon | undefined {
    return undefined;
  }
  abstract getRepr(): ReprInRuntime;
}

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

class ValueBoxDircet extends ValueBox {
  constructor(
    private value: Value_Direct,
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

class ValueBoxContainer extends ValueBox {
  constructor(
    private value: Value_Container,
    private representation: ReprInRuntime,
  ) {
    super();
  }

  get(): ["ok", Value] | ["error", RuntimeError] {
    return this.errorBeacon?.error
      ? ["error", this.errorBeacon.error]
      : ["ok", this.value];
  }
  get errorBeacon() {
    return this.value.errorBeacon;
  }
  confirmsError(): boolean {
    return this.errorBeacon?.comfirmsError() ?? false;
  }
  getRepr(): ReprInRuntime {
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

  private _errorBeacon: ErrorBeacon;
  private _errorSetter!: (error: RuntimeError) => void;
  get errorBeacon() {
    return this._errorBeacon;
  }

  constructor(
    private yielder?: () => ValueBox,
  ) {
    super();
    this._errorBeacon = new ErrorBeacon((s) => this._errorSetter = s);
  }

  get(): ["ok", Value] | ["error", RuntimeError] {
    if (!this.memo) {
      const valueBox = this.yielder!();
      delete this.yielder;
      const result = valueBox.get();
      this.memo = [result, valueBox.getRepr()];
      if (result[0] === "error") {
        this._errorSetter(result[1]);
      }
    }
    return this.memo[0];
  }
  confirmsError(): boolean {
    return this.errorBeacon.comfirmsError();
  }
  getRepr(): ReprInRuntime {
    if (this.memo) {
      return this.memo[1];
    }
    return createRepr.unevaluated();
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
  | Value_Direct
  | Value_Container;
/**
 * 没有更内部内容的值。
 * 用这样的值创建 ValueBox 时不用检查内部是否存在错误。
 */
export type Value_Direct =
  | number
  | boolean
  | Value_Callable;
export type Value_Container =
  | Value_List
  | Value_Stream;
type Value_Plain = Exclude<Value, Value_Stream>;

export const createValue = {
  callable: createCallable,

  list: createList,

  stream$list: createStream$list,

  stream$sum: createStream$sum,

  streamTransformer: createStreamTransformer,
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
  errorBeacon: ErrorBeacon;
};

export type Value_Stream = Value_Stream$List | Value_Stream$Sum;

export interface Value_StreamBase<
  Type extends string,
  Item,
  CastingImplicitlyTo extends Value_Plain,
> {
  type: Type;

  errorBeacon?: ErrorBeacon;

  at: (index: number) => Item | null;

  atWithStatus: (
    index: number,
  ) => ["ok" | "last" | "last_nominal", Item] | null;

  /**
   * 隐式转换成其他类型的值。
   */
  castImplicitly(): CastingImplicitlyTo;

  /**
   * 可用的名义上的长度。
   *
   * 当流尚未到达名义上的界限时，这个值是实际长度，否则这个值是名义长度。
   */
  get availableNominalLength(): number;

  get nominalFragments(): StreamFragment<Item>[];
  get surplusFragments(): StreamFragment<Item>[] | null;
  /**
   * 所有产生了的片段，用于生成步骤展现。
   */
  get actualFragments(): StreamFragment<Item>[];
}

export type StreamFragment<T> = [
  /**
   * 留下的元素。
   */
  kept: [type: "regular", item: T],
  /**
   * 在上一个留下的元素与这次留下的元素之间的被遗弃（如在 reroll、filter 时）的元素。
   */
  abandonedBefore?: T[],
];

/**
 * 可以隐式转换为列表的流。
 */
export type Value_Stream$List = Value_StreamBase<
  "stream$list",
  ValueBox,
  Value_List
>;
/**
 * 可以隐式转换为整数（通过求和）的流。
 */
export type Value_Stream$Sum = Value_StreamBase<"stream$sum", number, number>;

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
