import { Unreachable } from "@dicexp/errors";
import { Node, RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import {
  asCallable,
  asInteger,
  createValue,
  getValueTypeDisplayName,
  Value_Container,
} from "@dicexp/naive-evaluator-runtime/values";
import {
  RegularFunctionAlias,
  Scope,
} from "@dicexp/naive-evaluator-runtime/scopes";
import {
  createRuntimeError,
  RuntimeError,
} from "@dicexp/naive-evaluator-runtime/runtime-errors";
import {
  createValueBox,
  ValueBox,
} from "@dicexp/naive-evaluator-runtime/value-boxes";
import {
  createRepr,
  ReprInRuntime,
} from "@dicexp/naive-evaluator-runtime/repr";
import { RegularFunction } from "@dicexp/naive-evaluator-runtime/regular-functions";

import { RuntimeProxy } from "./runtime";

export class ConcreteValueBoxFactory {
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

  literalList(list: ValueBox[]): ValueBox {
    return createValueBox.container(createValue.list(list));
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
    if (fnResult[0] === "alias") {
      const fullRealName = fnResult[2];
      name = fullRealName.slice(0, fullRealName.lastIndexOf("/"));
    }

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
          const err = createRuntimeError.wrongArity(
            arity,
            args.length,
            "closure",
          );
          return createValueBox.error(err);
        }

        const deeperScope: Scope = Object.setPrototypeOf({}, scope);
        for (const [i, ident] of paramIdentList.entries()) {
          if (ident === "_") continue;
          if (Object.prototype.hasOwnProperty.call(deeperScope, ident)) {
            return createValueBox.error(
              createRuntimeError.duplicateClosureParameterNames(ident),
            );
          }
          deeperScope[ident] = args[i]!;
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
          const err = createRuntimeError.wrongArity(
            arity,
            args.length,
            "captured",
          );
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
      return this.error(createRuntimeError.valueIsNotCallable(), callRepr);
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
          const repr = createRepr.repetition(
            count.getRepr(),
            bodyRaw,
            createRepr.error_indirect(),
          );
          return this.error(countResult[1], repr, true);
        }
        // countResult[0] === "ok"
        const countValue_ = countResult[1];
        const countValue = asInteger(countValue_);

        if (countValue === null) {
          const typeName = getValueTypeDisplayName(countValue_);
          const errMsg = `反复次数期待「整数」，实际类型为「${typeName}」`;
          const repr = createRepr.repetition(count.getRepr(), bodyRaw);
          return this.error(createRuntimeError.simple(errMsg), repr);
        }

        let seq: Value_Container;
        if (countValue === 0) {
          seq = createValue.list([]);
        } else {
          let yieldedCount = 0;
          seq = createValue.sequence(
            () => {
              const valueBox = this.runtime.interpret(scope, body);
              yieldedCount++;
              return [
                yieldedCount === countValue ? "last_nominal" : "ok",
                [["regular", valueBox]],
              ];
            },
            { initialNominalLength: countValue },
          );
        }

        const repr = createRepr.repetition(
          count.getRepr(),
          bodyRaw,
          createRepr.value(seq),
        );
        return createValueBox.container(seq, repr);
      },
    );
  }
}

function getFunctionFromScope(
  scope: Scope,
  identifier: string,
  arity: number,
):
  | ["ok", RegularFunction]
  | [type: "alias", fn: RegularFunction, fullRealName: string]
  | ["error", RuntimeError] {
  const fnName = `${identifier}/${arity}`;
  let fn = scope[fnName];
  let realName: string | undefined;
  while (true) {
    if (!fn) {
      return ["error", createRuntimeError.unknownRegularFunction(fnName)];
    }
    if (typeof fn === "function") {
      return realName ? ["alias", fn, realName] : ["ok", fn];
    }
    if (fn instanceof RegularFunctionAlias) {
      realName = fn.to;
      fn = scope[fn.to];
      continue;
    }
    throw new Unreachable();
  }
}

const MAX_SAFE_INTEGER = 2 ** 53 - 1;
const MIN_SAFE_INTEGER = -(2 ** 53) + 1;
// 只需通常函数的结果，字面量由 parsing 检查，其他则不会改变数值
function checkInteger(n: number): RuntimeError | null {
  if (n > MAX_SAFE_INTEGER) {
    return createRuntimeError.limitationExceeded(
      "最大安全整数",
      null,
      MAX_SAFE_INTEGER,
    );
  } else if (n < MIN_SAFE_INTEGER) {
    return createRuntimeError.limitationExceeded(
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
