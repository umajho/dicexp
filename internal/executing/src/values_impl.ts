import { Unreachable } from "@dicexp/errors";
import type { Node, RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import {
  asCallable,
  type Concrete,
  type LazyValue,
  type LazyValueWithMemo,
  makeRuntimeError,
  type RuntimeError,
  type RuntimeRepresentation,
  type RuntimeResult,
  type Value,
  type Value_Callable,
  type Value_List,
  type Value_List$Extendable,
} from "./runtime_values/mod";
import {
  representCall,
  representCaptured,
  representError,
  representLazyValue,
  representRepetition,
  representResult,
  representValue,
} from "./representations_impl";
import type { RegularFunction, RuntimeProxy, Scope } from "./runtime";
import {
  getTypeDisplayName,
  runtimeError_duplicateClosureParameterNames,
  runtimeError_limitationExceeded,
  runtimeError_unknownRegularFunction,
  runtimeError_valueIsNotCallable,
  runtimeError_wrongArity,
} from "./runtime_errors_impl";

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

  v.memo = concrete;
  return v.memo;
}

export class LazyValueFactory {
  constructor(
    private runtime: RuntimeProxy,
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
        representation: source
          ? ["(", ...source, "=>", representError(error), ")"]
          : representError(error),
      },
    };
  }

  list(list: LazyValue[]): LazyValueWithMemo {
    return {
      memo: {
        value: { ok: list },
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
        const errFromReporter = this.runtime.reporter.called?.();
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
          return { error: runtimeError_wrongArity(arity, args.length) };
        }

        const deeperScope: Scope = Object.setPrototypeOf({}, scope);
        for (const [i, ident] of paramIdentList.entries()) {
          if (ident === "_") continue;
          if (Object.prototype.hasOwnProperty.call(deeperScope, ident)) {
            return {
              error: runtimeError_duplicateClosureParameterNames(ident),
            };
          }
          deeperScope[ident] = args[i];
        }

        let interpreted = runtime.interpret(deeperScope, body);
        if (this.runtime.reporter.closureEnter) {
          const oldInterpreted = interpreted;
          interpreted = {
            _yield: () => {
              const errFromReporter = this.runtime.reporter.closureEnter!();
              if (errFromReporter) {
                return this.error(
                  errFromReporter,
                  [representLazyValue(oldInterpreted)],
                ).memo;
              }
              const concretized = concretize(oldInterpreted, runtime);
              this.runtime.reporter.closureExit!();
              return concretized;
            },
          };
        }

        const result = { ok: interpreted };
        return result;
      },

      representation: [raw],
    };

    return {
      memo: {
        value: { ok: closure },
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
          return { error: runtimeError_wrongArity(arity, args.length) };
        }

        return fn(args, runtime);
      },

      representation,
    };

    return {
      memo: {
        value: { ok: captured },
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
      const err = runtimeError_valueIsNotCallable();
      return this.error(err, calling);
    }

    return {
      _yield: (): Concrete => {
        const errFromReporter = this.runtime.reporter.called?.();
        if (errFromReporter) return this.error(errFromReporter, calling).memo;

        const result = callable._call(args);

        if ("error" in result) {
          return this.error(result.error, calling).memo;
        }
        const concrete = concretize(result.ok, this.runtime);
        const value = concrete.value;
        return {
          value,
          representation: ["(", ...calling, "=>", representResult(value), ")"],
        };
      },
    };
  }

  repetition(
    count: LazyValue,
    body: Node,
    bodyRaw: string,
    scope: Scope,
  ): LazyValue {
    const representation = representRepetition(count, bodyRaw);
    return {
      _yield: (): Concrete => {
        const countResult = concretize(count, this.runtime).value;
        if ("error" in countResult) {
          return this.error(countResult.error, representation).memo;
        }
        const countValue = countResult.ok;
        if (typeof countValue != "number") {
          const typeName = getTypeDisplayName(getTypeNameOfValue(countValue));
          const errMsg = `反复次数期待「整数」，实际类型为「${typeName}」`;
          return this.error(makeRuntimeError(errMsg), representation).memo;
        }

        const underlying: Value_List = Array(countValue);
        const list: Value_List$Extendable = {
          type: "list$extendable",
          nominalLength: countValue,
          _at: (index) => {
            let current = underlying[index];
            if (!current) {
              underlying[index] = this.runtime.interpret(scope, body);
            }
            return current;
          },
          _asList: () => {
            for (let i = 0; i < countValue; i++) {
              if (!underlying[i]) {
                underlying[i] = this.runtime.interpret(scope, body);
              }
            }
            return underlying.slice(0, countValue);
          },
        };

        return {
          value: { ok: list },
          representation,
        };
      },
    };
  }
}

function getFunctionFromScope(
  scope: Scope,
  identifier: string,
  arity: number,
): RuntimeResult<RegularFunction> {
  const fnName = `${identifier}/${arity}`;
  const fn = scope[fnName];
  if (!fn) {
    return { error: runtimeError_unknownRegularFunction(fnName) };
  }
  if (typeof fn !== "function") throw new Unreachable();
  return { ok: fn };
}

export function getTypeNameOfValue(v: Value) {
  switch (typeof v) {
    case "number":
      return "integer";
    case "boolean":
      return "boolean";
    default:
      if (Array.isArray(v)) return "list";
      return v.type;
      throw new Unreachable();
  }
}
export type ValueTypeName = ReturnType<typeof getTypeNameOfValue>;

const MAX_SAFE_INTEGER = 2 ** 53 - 1;
const MIN_SAFE_INTEGER = -(2 ** 53) + 1;
// 只需通常函数的结果，字面量由 parsing 检查，其他则不会改变数值
function checkInteger(n: number): RuntimeError | null {
  if (n > MAX_SAFE_INTEGER) {
    return runtimeError_limitationExceeded(
      "最大安全整数",
      null,
      MAX_SAFE_INTEGER,
    );
  } else if (n < MIN_SAFE_INTEGER) {
    return runtimeError_limitationExceeded(
      "最小安全整数",
      null,
      MIN_SAFE_INTEGER,
    );
  }
  return null;
}
