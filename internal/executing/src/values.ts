import { Unreachable } from "@dicexp/errors";
import type { Node, RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import {
  representCall,
  representCaptured,
  representError,
  representResult,
  representValue,
  type RuntimeRepresentation,
} from "./representations";
import type { RegularFunction, RuntimeProxy, Scope } from "./runtime";
import {
  RuntimeError,
  RuntimeError_DuplicateClosureParameterNames,
  RuntimeError_LimitationExceeded,
  RuntimeError_UnknownRegularFunction,
  RuntimeError_ValueIsNotCallable,
  RuntimeError_WrongArity,
} from "./runtime_errors";

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

export function concretize(
  v: LazyValue,
  rtm: RuntimeProxy | null,
): Concrete {
  if (v.memo) return v.memo;

  let concreteOrLazy = v._yield!();
  let concrete: Concrete;
  if ("lazy" in concreteOrLazy) {
    v.replacedBy = concreteOrLazy.lazy;
    concrete = concretize(concreteOrLazy.lazy, rtm);
  } else {
    concrete = concreteOrLazy;
  }
  if (concrete.volatile) {
    if (v.memo) throw new Unreachable();
    v.memo = false;

    v.stabilizedAs ??= [];
    v.stabilizedAs.push(concrete);

    return concrete;
  } else {
    if (Array.isArray(concrete)) throw new Unreachable();
    v.memo = concrete;
    return v.memo;
  }
}

export interface Concrete {
  value: RuntimeResult<Value>;
  volatile: boolean;
  representation: RuntimeRepresentation;
}

export type Value =
  | number
  | boolean
  | Value_List
  | Value_Callable;

export type Value_List = LazyValue[];

export interface Value_Callable {
  type: "callable";
  arity: number;
  _call: (args: LazyValue[]) => RuntimeResult<LazyValue>;

  representation: RuntimeRepresentation;
}

export class LazyValueFactory {
  constructor(
    private runtime: RuntimeProxy | null,
  ) {}

  identifier(
    lazyValue: LazyValue,
    ident: string,
  ): LazyValue {
    return {
      _yield: () => {
        // 能通过标识符引用的值会被固定，因此 reevaluate 为 false
        const inner = concretize(lazyValue, this.runtime);
        const c: Concrete = {
          value: inner.value,
          volatile: false,
          // 使用 `inner.value` 是为了切断之前的 representation，以免过于冗长
          //（而且函数调用中的参数列表已经将对应的内容展示过了）
          representation: [`(${ident}=`, representResult(inner.value), `)`],
        };
        return c;
      },
    };
  }

  literal(value: Value): LazyValueWithMemo {
    // if (typeof value === "number") { // 由 parsing 负责，这里无需检查
    //   const err = checkInteger(value);
    //   if (err) return this.error(err, [{ v: value }]);
    // }
    return {
      memo: {
        value: { ok: value },
        volatile: false,
        representation: representValue(value),
      },
    };
  }

  error(
    error: RuntimeError,
    source?: RuntimeRepresentation,
  ): LazyValueWithMemo {
    return {
      memo: {
        value: { error: error },
        volatile: false,
        representation: source
          ? ["(", ...source, "=>", representError(error), ")"]
          : representError(error),
      },
    };
  }

  stabilized(underlying: LazyValue): LazyValue {
    let stabilized: Concrete | null = null;
    return {
      _yield: () => {
        if (stabilized) return stabilized;
        const concrete = concretize(underlying, this.runtime);

        underlying.stabilizedAs ??= [];
        underlying.stabilizedAs.push(concrete);

        if ("error" in concrete.value) {
          stabilized = concrete;
        } else {
          let value = concrete.value.ok;
          if (Array.isArray(value)) {
            value = this._stabilizeList(value);
          }
          stabilized = {
            value: { ok: value },
            volatile: false,
            representation: representValue(value),
          };
        }

        return stabilized;
      },
    };
  }

  private _stabilizeList(list: Value_List): Value_List {
    return list.map((el) => {
      if (el.stabilized) return el;

      const concrete = concretize(el, this.runtime);
      if ("error" in concrete.value) {
        return { memo: concrete, stabilized: true };
      }

      if (Array.isArray(concrete.value.ok)) {
        const list = this.list(this._stabilizeList(concrete.value.ok));
        return { ...list, stabilized: true };
      }
      return { memo: concrete, stabilized: true };
    });
  }

  list(list: LazyValue[]): LazyValueWithMemo {
    return {
      memo: {
        value: { ok: list },
        volatile: false,
        representation: representValue(list),
      },
    };
  }

  callRegularFunction(
    scope: Scope,
    name: string,
    args: LazyValue[],
    style: RegularCallStyle,
    runtime: RuntimeProxy,
  ): LazyValue {
    const calling = representCall([name], args, "regular", style);

    const fnResult = getFunctionFromScope(scope, name, args.length);
    if ("error" in fnResult) {
      return this.error(fnResult.error, calling);
    }
    const fn = fnResult.ok;

    return {
      _yield: () => {
        const errFromReporter = this.runtime?.reporter
          .regularFunctionCalled?.();
        if (errFromReporter) return this.error(errFromReporter, calling).memo;

        const result = fn(args, runtime);
        if ("error" in result) {
          return this.error(result.error, calling).memo;
        }
        const concrete = concretize(result.ok, this.runtime);
        const value = concrete.value;

        if ("ok" in value && typeof value.ok === "number") {
          const err = checkInteger(value.ok);
          if (err) return this.error(err, representValue(value.ok)).memo;
        }

        return {
          value,
          volatile: concrete.volatile,
          representation: ["(", ...calling, "=>", representResult(value), ")"],
        };
      },
    };
  }

  closure(
    paramIdentList: string[],
    body: Node,
    scope: Scope,
    runtime: RuntimeProxy,
    raw: string,
  ): LazyValueWithMemo {
    const arity = paramIdentList.length;
    const closure: Value_Callable = {
      type: "callable",
      arity,
      _call: (args) => {
        if (args.length !== arity) {
          return { error: new RuntimeError_WrongArity(arity, args.length) };
        }

        const deeperScope: Scope = Object.setPrototypeOf({}, scope);
        for (const [i, ident] of paramIdentList.entries()) {
          if (ident === "_") continue;
          if (Object.prototype.hasOwnProperty.call(deeperScope, ident)) {
            return {
              error: new RuntimeError_DuplicateClosureParameterNames(ident),
            };
          }
          deeperScope[ident] = this.stabilized(args[i]);
        }

        const result = { ok: runtime.interpret(deeperScope, body) };
        return result;
      },

      representation: [raw],
    };

    return {
      memo: {
        value: { ok: closure },
        volatile: false,
        representation: representValue(closure),
      },
    };
  }

  captured(
    identifier: string,
    arity: number,
    scope: Scope,
    runtime: RuntimeProxy,
  ): LazyValueWithMemo {
    const representation = representCaptured(identifier, arity);

    const fnResult = getFunctionFromScope(scope, identifier, arity);
    if ("error" in fnResult) {
      return this.error(fnResult.error, representation);
    }
    const fn = fnResult.ok;

    const captured: Value_Callable = {
      type: "callable",
      arity,
      _call: (args) => {
        if (args.length !== arity) {
          return { error: new RuntimeError_WrongArity(arity, args.length) };
        }

        return fn(args, runtime);
      },

      representation,
    };

    return {
      memo: {
        value: { ok: captured },
        volatile: false,
        representation: representValue(captured),
      },
    };
  }

  callValue(
    value: LazyValue,
    args: LazyValue[],
    style: ValueCallStyle,
  ): LazyValue {
    const concrete = concretize(value, this.runtime);
    const concreteRepresentation = concrete.representation;
    const calling = representCall(concreteRepresentation, args, "value", style);

    if ("error" in concrete.value) {
      return this.error(concrete.value.error, calling);
    }
    const callable = asCallable(concrete.value.ok);
    if (!callable) {
      const err = new RuntimeError_ValueIsNotCallable();
      return this.error(err, calling);
    }

    return {
      _yield: (): Concrete => {
        const errFromReporter = this.runtime?.reporter.closureCalled?.();
        if (errFromReporter) return this.error(errFromReporter, calling).memo;

        const result = callable._call(args);

        if ("error" in result) {
          return this.error(result.error, calling).memo;
        }
        const concrete = concretize(result.ok, this.runtime);
        const value = concrete.value;
        return {
          value,
          volatile: concrete.volatile,
          representation: ["(", ...calling, "=>", representResult(value), ")"],
        };
      },
    };
  }
}

export function callCallable(
  callable: Value_Callable,
  args: LazyValue[],
): RuntimeResult<LazyValue> {
  return callable._call(args);
}

function asCallable(
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

function getFunctionFromScope(
  scope: Scope,
  identifier: string,
  arity: number,
): RuntimeResult<RegularFunction> {
  const fnName = `${identifier}/${arity}`;
  const fn = scope[fnName];
  if (!fn) {
    return { error: new RuntimeError_UnknownRegularFunction(fnName) };
  }
  if (typeof fn !== "function") throw new Unreachable();
  return { ok: fn };
}

export function getTypeNameOfValue(v: Value) {
  switch (typeof v) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      if (Array.isArray(v)) return "list";
      if (v.type === "callable") return "callable";
      if (v.type === "generating") return "generating";
      throw new Unreachable();
  }
}
export type ValueTypeName = ReturnType<typeof getTypeNameOfValue>;

const MAX_SAFE_INTEGER = 2 ** 53 - 1;
const MIN_SAFE_INTEGER = -(2 ** 53) + 1;
// 只需通常函数的结果，字面量由 parsing 检查，其他则不会改变数值
function checkInteger(n: number): RuntimeError | null {
  if (n > MAX_SAFE_INTEGER) {
    return new RuntimeError_LimitationExceeded(
      "最大安全整数",
      null,
      MAX_SAFE_INTEGER,
    );
  } else if (n < MIN_SAFE_INTEGER) {
    return new RuntimeError_LimitationExceeded(
      "最小安全整数",
      null,
      MIN_SAFE_INTEGER,
    );
  }
  return null;
}
