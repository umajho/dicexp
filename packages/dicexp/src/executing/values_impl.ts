import { Unreachable } from "@dicexp/errors";
import { Node, RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import {
  asCallable,
  createRepr,
  createValue,
  createValueBox,
  getDisplayNameOfValue,
  makeRuntimeError,
  ReprInRuntime,
  RuntimeError,
  Value_List,
  Value_List$Extendable,
  ValueBox,
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
    return createValueBox.lazy(() => {
      const result = valueBox.get();
      if (result[0] === "ok") {
        return createValueBox.value(
          result[1],
          createRepr.identifier(ident, createRepr.value(result[1])),
        );
      } else { // result[0] === "error"
        return createValueBox.error(
          result[1],
          { source: createRepr.identifier(ident) },
        );
      }
    });
  }

  literalPrimitive(value: number | boolean): ValueBox {
    return createValueBox.direct(value);
  }

  error(
    error: RuntimeError,
    source?: ReprInRuntime,
    indirect?: boolean,
  ): ValueBox {
    return createValueBox.error(error, { source, indirect });
  }

  literalList(list: Value_List): ValueBox {
    return createValueBox.list(list);
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

    return createValueBox.lazy(
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
          args.map((arg) => () => arg.getRepr()),
          resultBox.getRepr(),
        );

        if (result[0] === "error") return this.error(result[1], reprCall, true);
        // result[0] === "ok"
        const value = result[1];

        if (typeof value === "number") {
          const err = checkInteger(value);
          if (err) return this.error(err, reprCall);
        }

        return createValueBox.value(value, reprCall);
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
    const closure = createValue.callable(
      arity,
      // TODO: 当调用 `_call` 时，返回的值一定马上会用到吧，
      //       那此函数内处理惰性是否没有意义？
      (args) => {
        if (args.length !== arity) {
          const err = runtimeError_wrongArity(arity, args.length, "closure");
          return createValueBox.error(err);
        }

        const deeperScope: Scope = Object.setPrototypeOf({}, scope);
        for (const [i, ident] of paramIdentList.entries()) {
          if (ident === "_") continue;
          if (Object.prototype.hasOwnProperty.call(deeperScope, ident)) {
            return createValueBox.error(
              runtimeError_duplicateClosureParameterNames(ident),
            );
          }
          deeperScope[ident] = args[i];
        }

        let interpreted = runtime.interpret(deeperScope, body);
        if (this.runtime.reporter.closureEnter) {
          const oldInterpreted = interpreted;
          interpreted = createValueBox.lazy(
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

        return createValueBoxOfIndirectErrorIfErrorIsFromArgument(
          args,
          interpreted,
        ) ?? interpreted;
      },
      createRepr.raw(raw),
    );

    return createValueBox.direct(closure);
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

    const captured = createValue.callable(
      arity,
      (args) => {
        if (args.length !== arity) {
          const err = runtimeError_wrongArity(arity, args.length, "captured");
          return createValueBox.error(err);
        }

        const returned = fn(args, runtime);
        return createValueBoxOfIndirectErrorIfErrorIsFromArgument(
          args,
          returned,
        ) ?? returned;
      },
      representation,
    );

    return createValueBox.direct(captured);
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

    return createValueBox.lazy(
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
          args.map((arg) => () => arg.getRepr()),
          resultBox.getRepr(),
        );

        if (result[0] === "error") return this.error(result[1], callRepr, true);
        // result[0] === "ok"
        const value = result[1];

        return createValueBox.value(value, callRepr);
      },
    );
  }

  repetition(
    count: ValueBox,
    body: Node,
    bodyRaw: string,
    scope: Scope,
  ): ValueBox {
    return createValueBox.lazy(
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
        return createValueBox.direct(list, repr);
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

function createValueBoxOfIndirectErrorIfErrorIsFromArgument(
  args: ValueBox[],
  callReturn: ValueBox,
): ValueBox | null {
  const result = callReturn.get();
  if (
    result[0] === "error" &&
    args.some((arg) => arg.confirmsError())
  ) {
    return createValueBox.error(result[1], { indirect: true });
  }
  return null;
}
