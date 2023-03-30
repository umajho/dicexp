import type { Node, RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import { Unreachable } from "./errors";
import type { RegularFunction, RuntimeProxy, Scope } from "./runtime";
import {
  RuntimeError,
  RuntimeError_DuplicateClosureParameterNames,
  RuntimeError_UnknownRegularFunction,
  RuntimeError_ValueIsNotCallable,
  RuntimeError_WrongArity,
} from "./runtime_errors";
import { flatten, intersperse } from "./utils";

// TODO: { concrete } & ({ _yield/_yielder }  | { _iterator: { _yield/_yielder/, length } })

export type RuntimeResult<OkType> =
  | { ok: OkType }
  | { error: RuntimeError };

/**
 * NOTE: LazyValue 实例的引用会一直留到渲染步骤时使用。
 *       在渲染步骤时，会根据 concrete 是否有值来判断对应 LazyValue 是否求过值。
 *       因此，不应该为了不可变性而在操作 LazyValue 时为其创建新的副本。
 */
export interface LazyValue {
  memo?: Concrete | false;
  stabilized?: true;
  _yield?: () => Concrete | { lazy: LazyValue };

  replacedBy?: LazyValue;
}

export interface LazyValueWithMemo extends LazyValue {
  memo: Concrete;
}

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
    return concrete;
  } else {
    v.memo = concrete;
    return v.memo;
  }
}

export type Representation = (
  | string
  | LazyValue
  | Concrete
  | { v: RuntimeResult<Value> | Value }
  | { e: RuntimeError }
  | { n: Node }
  | (() => Representation)
)[];

export interface Concrete {
  value: RuntimeResult<Value>;
  volatile: boolean;
  representation: Representation;
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
          representation: [`(${ident}=`, { v: inner.value }, `)`],
        };
        return c;
      },
    };
  }

  literal(value: Value): LazyValueWithMemo {
    return {
      memo: {
        value: { ok: value },
        volatile: false,
        representation: [{ v: value }],
      },
    };
  }

  error(
    error: RuntimeError,
    source?: Representation,
  ): LazyValueWithMemo {
    return {
      memo: {
        value: { error: error },
        volatile: false,
        representation: source
          ? ["(", ...source, "=>", { e: error }, ")"]
          : [{ e: error }],
      },
    };
  }

  stabilized(underlying: LazyValue): LazyValue {
    let stabilized: Concrete | null = null;
    return {
      _yield: () => {
        if (stabilized) return stabilized;
        const concrete = concretize(underlying, this.runtime);
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
            representation: [{ v: value }],
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
        representation: [() => ["[", ...representList(list), "]"]],
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

        args = args.map((v) => ({
          _yield: () => {
            return concretize(v, this.runtime);
          },
        }));

        const result = fn(args, runtime);
        if ("error" in result) {
          return this.error(result.error, calling).memo;
        }
        const concrete = concretize(result.ok, this.runtime);
        const value = concrete.value;
        return {
          value,
          volatile: concrete.volatile,
          representation: ["(", ...calling, " => ", { v: value }, ")"],
        };
      },
    };
  }

  closure(
    paramIdentList: string[],
    body: Node,
    scope: Scope,
    runtime: RuntimeProxy,
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
    };

    return {
      memo: {
        value: { ok: closure },
        volatile: false,
        representation: representClosure(paramIdentList, body),
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
    };

    return {
      memo: {
        value: { ok: captured },
        volatile: false,
        representation,
      },
    };
  }

  callValue(
    value: LazyValue,
    args: LazyValue[],
    style: ValueCallStyle,
  ): LazyValue {
    const calling = representCall([value], args, "value", style);

    const concrete = concretize(value, this.runtime);
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
          representation: ["(", ...calling, " => ", { v: value }, ")"],
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

function representList(list: (LazyValue | Concrete)[]): Representation {
  const l = flatten(intersperse(list as Representation[], [","]));
  return l as unknown as Representation;
}

function representClosure(
  paramIdentList: string[],
  body: Node,
): Representation {
  return [() => {
    return ["\\(" + paramIdentList.join(", ") + " -> ", { n: body }, ")"];
  }];
}

function representCaptured(
  identifier: string,
  arity: number,
): Representation {
  return ["&", identifier, `/${arity}`];
}

function representCall(
  callee: Representation,
  args: LazyValue[],
  kind: "regular" | "value",
  style: RegularCallStyle | ValueCallStyle,
): Representation {
  if (style === "operator") {
    if (args.length === 1) return ["(", ...callee, args[0], ")"];
    if (args.length === 2) return ["(", args[0], ...callee, args[1], ")"];
    throw new Unreachable();
  }

  return [() => {
    const r = [];
    if (style === "piped") {
      r.push("(", args[0], " |> ");
    }
    r.push(...callee);
    if (kind === "value") {
      r.push(".");
    }
    // TODO: 也许可以附上 label
    r.push("(", ...representList(args), ")");
    if (style === "piped") {
      r.push(")");
    }
    return [];
  }];
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
