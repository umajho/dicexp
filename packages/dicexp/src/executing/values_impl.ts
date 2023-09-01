import { Unreachable } from "@dicexp/errors";
import { Node, RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import {
  asCallable,
  createRepr,
  getDisplayNameOfValue,
  makeRuntimeError,
  ReprInRuntime,
  RuntimeError,
  Value,
  Value_Callable,
  Value_List,
  Value_List$Extendable,
  ValueBox,
  ValueBoxDircet,
  ValueBoxError,
  ValueBoxLazy,
} from "@dicexp/runtime/values";
import { RegularFunction, Scope } from "@dicexp/runtime/values";
import {
  runtimeError_duplicateClosureParameterNames,
  runtimeError_limitationExceeded,
  runtimeError_unknownRegularFunction,
  runtimeError_valueIsNotCallable,
  runtimeError_wrongArity,
} from "@dicexp/runtime/errors";
import { RuntimeProxy } from "./runtime";

export class LazyValueFactory {
  constructor(
    private runtime: RuntimeProxy,
  ) {}

  identifier(
    valueBox: ValueBox,
    ident: string,
  ): ValueBox {
    return new ValueBoxLazy(() => {
      const result = valueBox.get();
      if (result[0] === "ok") {
        return new ValueBoxDircet(
          result[1],
          createRepr.identifier(ident, createRepr.value(result[1])),
        );
      } else { // result[0] === "error"
        return new ValueBoxError(
          result[1],
          createRepr.error("direct", result[1], createRepr.identifier(ident)),
        );
      }
    });
  }

  literal(value: Value): ValueBox {
    return new ValueBoxDircet(value);
  }

  error(
    error: RuntimeError,
    source?: ReprInRuntime,
  ): ValueBox {
    return source
      ? new ValueBoxError(error, { source })
      : new ValueBoxError(error);
  }

  list(list: ValueBox[]): ValueBox {
    return new ValueBoxDircet(list);
  }

  callRegularFunction(
    scope: Scope,
    name: string,
    args: ValueBox[],
    style: RegularCallStyle,
    runtime: RuntimeProxy,
  ): ValueBox {
    const fnResult = getFunctionFromScope(scope, name, args.length);
    if (fnResult[0] === "error") {
      return this.error(fnResult[1], createRepr.call_regular(style, name));
    }
    // fnResult[0] === "ok"
    const fn = fnResult[1];

    return new ValueBoxLazy(
      () => {
        const errFromReporter = this.runtime.reporter.called?.();
        if (errFromReporter) {
          const sourceRepr = createRepr.call_regular(style, name);
          return this.error(errFromReporter, sourceRepr);
        }

        const resultBox = fn(args, runtime);
        const result = resultBox.get();
        const reprCall = createRepr.call_regular(
          style,
          name,
          args.map((arg) => arg.getRepr()),
          resultBox.getRepr(),
        );

        if (result[0] === "error") return this.error(result[1], reprCall);
        // result[0] === "ok"
        const value = result[1];

        if (typeof value === "number") {
          const err = checkInteger(value);
          if (err) return this.error(err, reprCall);
        }

        return new ValueBoxDircet(value, reprCall);
      },
    );
  }

  closure(
    paramIdentList: string[],
    body: Node,
    scope: Scope,
    runtime: RuntimeProxy,
    raw: string,
  ): ValueBox {
    const arity = paramIdentList.length;
    const closure: Value_Callable = {
      type: "callable",
      arity,
      _call: (args) => {
        if (args.length !== arity) {
          const err = runtimeError_wrongArity(arity, args.length, "closure");
          return new ValueBoxError(err);
        }

        const deeperScope: Scope = Object.setPrototypeOf({}, scope);
        for (const [i, ident] of paramIdentList.entries()) {
          if (ident === "_") continue;
          if (Object.prototype.hasOwnProperty.call(deeperScope, ident)) {
            return new ValueBoxError(
              runtimeError_duplicateClosureParameterNames(ident),
            );
          }
          deeperScope[ident] = args[i];
        }

        let interpreted = runtime.interpret(deeperScope, body);
        if (this.runtime.reporter.closureEnter) {
          const oldInterpreted = interpreted;
          interpreted = new ValueBoxLazy(
            () => {
              const errFromReporter = this.runtime.reporter.closureEnter!();
              if (errFromReporter) {
                return this.error(errFromReporter, oldInterpreted.getRepr());
              }
              oldInterpreted.get();
              this.runtime.reporter.closureExit!();
              return oldInterpreted;
            },
          );
        }

        return interpreted;
      },

      representation: createRepr.raw(raw),
    };

    return new ValueBoxDircet(closure);
  }

  captured(
    identifier: string,
    arity: number,
    scope: Scope,
    runtime: RuntimeProxy,
  ): ValueBox {
    const representation = createRepr.capture(identifier, arity);

    const fnResult = getFunctionFromScope(scope, identifier, arity);
    if (fnResult[0] === "error") {
      return this.error(fnResult[1], representation);
    }
    // fnResult[0] === "ok"
    const fn = fnResult[1];

    const captured: Value_Callable = {
      type: "callable",
      arity,
      _call: (args) => {
        if (args.length !== arity) {
          const err = runtimeError_wrongArity(arity, args.length, "captured");
          return new ValueBoxError(err);
        }

        return fn(args, runtime);
      },

      representation,
    };

    return new ValueBoxDircet(captured);
  }

  callValue(
    valueBox: ValueBox,
    args: ValueBox[],
    style: ValueCallStyle,
  ): ValueBox {
    // TODO: 这样会不会导致可能不必要的求值？要不要也放进 lazy 中？
    const valueResult = valueBox.get();
    const calleeRepr = valueBox.getRepr();

    if (valueResult[0] === "error") {
      const callRepr = createRepr.call_value(style, calleeRepr);
      return this.error(valueResult[1], callRepr);
    }
    // valueResult[0] === "ok"
    const value = valueResult[1];

    const callable = asCallable(value);
    if (!callable) {
      const callRepr = createRepr.call_value(style, calleeRepr);
      return this.error(runtimeError_valueIsNotCallable(), callRepr);
    }

    return new ValueBoxLazy(
      () => {
        const errFromReporter = this.runtime.reporter.called?.();
        if (errFromReporter) {
          const callRepr = createRepr.call_value(style, calleeRepr);
          return this.error(errFromReporter, callRepr);
        }

        const resultBox = callable._call(args);
        const result = resultBox.get();
        const callRepr = createRepr.call_value(
          style,
          calleeRepr,
          args.map((arg) => arg.getRepr()),
          resultBox.getRepr(),
        );

        if (result[0] === "error") return this.error(result[1], callRepr);
        // result[0] === "ok"
        const value = result[1];

        return new ValueBoxDircet(value, callRepr);
      },
    );
  }

  repetition(
    count: ValueBox,
    body: Node,
    bodyRaw: string,
    scope: Scope,
  ): ValueBox {
    return new ValueBoxLazy(
      () => {
        const countResult = count.get();

        if (countResult[0] === "error") {
          const repr = createRepr.repetition(count.getRepr(), bodyRaw);
          return this.error(countResult[1], repr);
        }
        // countResult[0] === "ok"
        const countValue = countResult[1];

        if (typeof countValue != "number") {
          const typeName = getDisplayNameOfValue(countValue);
          const errMsg = `反复次数期待「整数」，实际类型为「${typeName}」`;
          const repr = createRepr.repetition(count.getRepr(), bodyRaw);
          return this.error(makeRuntimeError(errMsg), repr);
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

        const repr = createRepr.repetition(
          count.getRepr(),
          bodyRaw,
          createRepr.value(list),
        );
        return new ValueBoxDircet(list, repr);
      },
    );
  }
}

function getFunctionFromScope(
  scope: Scope,
  identifier: string,
  arity: number,
): ["ok", RegularFunction] | ["error", RuntimeError] {
  const fnName = `${identifier}/${arity}`;
  const fn = scope[fnName];
  if (!fn) return ["error", runtimeError_unknownRegularFunction(fnName)];
  if (typeof fn !== "function") throw new Unreachable();
  return ["ok", fn];
}

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
