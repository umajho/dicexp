import type { Node, RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import { Unreachable } from "./errors";
import type { FunctionRuntime, RegularFunction, Scope } from "./runtime";
import {
  RuntimeError,
  RuntimeError_DuplicateClosureParameterNames,
  RuntimeError_UnknownRegularFunction,
  RuntimeError_ValueIsNotCallable,
  RuntimeError_WrongArity,
} from "./runtime_errors";
import { flatten, intersperse } from "./utils";

// TODO: { concrete } & ({ _evaluate } | { _yielder } | { _iterator: { _yielder, length } })

export type RuntimeResult<OkType> =
  | { ok: OkType }
  | { error: RuntimeError };

/**
 * NOTE: LazyValue 实例的引用会一直留到渲染步骤时使用。
 *       在渲染步骤时，会根据 concrete 是否有值来判断对应 LazyValue 是否求过值。
 *       因此，不应该为了不可变性而在操作 LazyValue 时为其创建新的副本。
 */
export interface LazyValue {
  concrete?: Concrete;
  _evaluate?: (reevaluate: boolean) => Concrete | { lazy: LazyValue };

  replacedBy?: LazyValue;
}

export interface EvaluatedLazyValue extends LazyValue {
  concrete: Concrete;
}

/**
 * @param v
 * @param reevaluate
 *  对于当前正在求值的函数而言，是否忽略之前的结果，重新求值。
 * @returns
 */
export function evaluate(
  v: LazyValue,
  reevaluate: boolean,
): EvaluatedLazyValue {
  if (v.concrete) {
    if (v.concrete.volatile && reevaluate) {
      v = { _evaluate: v._evaluate };
    } else {
      return v as EvaluatedLazyValue;
    }
  }
  let evaluated = v._evaluate!(reevaluate);
  if ("lazy" in evaluated) {
    v.replacedBy = evaluated.lazy;
    return evaluate(evaluated.lazy, reevaluate);
  }
  v.concrete = evaluated;
  return v as EvaluatedLazyValue;
}

export type Representation = (
  | string
  | LazyValue
  | { c: Concrete }
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
  | LazyValue[]
  | Value_Callable;

export function lazyValue_identifier(
  lazyValue: LazyValue,
  ident: string,
): LazyValue {
  return {
    _evaluate: (_reevaluate) => {
      // 能通过标识符引用的值会被固定，因此 reevaluate 为 false
      const inner = evaluate(lazyValue, false).concrete;
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

export function lazyValue_literal(value: Value): EvaluatedLazyValue {
  return {
    concrete: {
      value: { ok: value },
      volatile: false,
      representation: [{ v: value }],
    },
  };
}

export function lazyValue_error(
  error: RuntimeError,
  source?: Representation,
): EvaluatedLazyValue {
  return {
    concrete: {
      value: { error: error },
      volatile: false,
      representation: source
        ? ["(", ...source, "=>", { e: error }, ")"]
        : [{ e: error }],
    },
  };
}

export function lazyValue_list(list: LazyValue[]): EvaluatedLazyValue {
  return {
    concrete: {
      value: { ok: list },
      volatile: false,
      representation: [() => {
        return [
          "[",
          ...representList(list),
          "]",
        ];
      }],
    },
  };
}

export interface Value_Callable {
  type: "callable";
  arity: number;
  _call: (args: LazyValue[]) => RuntimeResult<LazyValue>;
}

export function lazyValue_closure(
  paramIdentList: string[],
  body: Node,
  scope: Scope,
  runtime: FunctionRuntime,
): EvaluatedLazyValue {
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
        deeperScope[ident] = args[i];
      }

      return { ok: runtime.evaluate(deeperScope, body) };
    },
  };

  return {
    concrete: {
      value: { ok: closure },
      volatile: false,
      representation: representClosure(paramIdentList, body),
    },
  };
}

export function lazyValue_captured(
  identifier: string,
  arity: number,
  scope: Scope,
  runtime: FunctionRuntime,
): EvaluatedLazyValue {
  const representation = representCaptured(identifier, arity);

  const fnResult = getFunctionFromScope(scope, identifier, arity);
  if ("error" in fnResult) {
    return lazyValue_error(fnResult.error, representation);
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
    concrete: {
      value: { ok: captured },
      volatile: false,
      representation,
    },
  };
}

export function callRegularFunction(
  scope: Scope,
  name: string,
  args: LazyValue[],
  style: RegularCallStyle,
  runtime: FunctionRuntime,
): LazyValue {
  const calling = representCall([name], args, "regular", style);

  const fnResult = getFunctionFromScope(scope, name, args.length);
  if ("error" in fnResult) return lazyValue_error(fnResult.error, calling);
  const fn = fnResult.ok;

  return {
    _evaluate: (reevaluate) => {
      if (reevaluate) {
        args = args.map((v) => ({
          _evaluate: () => {
            return evaluate(v, true).concrete;
          },
        }));
      }
      const result = fn(args, runtime);
      if ("error" in result) {
        return lazyValue_error(result.error, calling).concrete;
      }
      const evaluated = evaluate(result.ok, reevaluate);
      const value = evaluated.concrete.value;
      return {
        value,
        volatile: evaluated.concrete.volatile,
        representation: ["(", ...calling, " => ", { v: value }, ")"],
      };
    },
  };
}

export function callCallable(
  callable: Value_Callable,
  args: LazyValue[],
): RuntimeResult<LazyValue> {
  return callable._call(args);
}

export function callValue(
  value: LazyValue,
  args: LazyValue[],
  style: ValueCallStyle,
  reevaluate: boolean,
): LazyValue {
  const calling = representCall([value], args, "value", style);

  const concrete = evaluate(value, false).concrete;
  if ("error" in concrete.value) {
    return lazyValue_error(concrete.value.error, calling);
  }
  const callable = asCallable(concrete.value.ok);
  if (!callable) {
    return lazyValue_error(new RuntimeError_ValueIsNotCallable(), calling);
  }

  return {
    _evaluate: (): Concrete => {
      const result = callable._call(args);
      if ("error" in result) {
        return lazyValue_error(result.error, calling).concrete;
      }
      const evaluated = evaluate(result.ok, reevaluate);
      const value = evaluated.concrete.value;
      return {
        value,
        volatile: evaluated.concrete.volatile,
        representation: ["(", ...calling, " => ", { v: value }, ")"],
      };
    },
  };
}

function representList(list: LazyValue[]): Representation {
  return flatten(intersperse(list as Representation[], [","]));
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
