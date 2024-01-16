import { Unimplemented, Unreachable } from "@dicexp/errors";
import {
  BasicExecutionAppendix,
  BasicExecutionStatistics,
  Repr,
} from "@dicexp/interface";
import {
  Node,
  Node_RegularCall,
  Node_Repetition,
  Node_ValueCall,
  NodeValue_Captured,
  NodeValue_Closure,
  NodeValue_List,
} from "@dicexp/nodes";
import {
  createRuntimeError,
  RuntimeError,
} from "@dicexp/runtime/runtime-errors";
import { asPlain, getValueTypeName, Value_List } from "@dicexp/runtime/values";
import { finalizeRepr } from "@dicexp/runtime/repr";
import { ValueBox } from "@dicexp/runtime/value-boxes";
import { RuntimeProxyForFunction } from "@dicexp/runtime/regular-functions";
import { RegularFunctionAlias, Scope } from "@dicexp/runtime/scopes";

import { ConcreteValueBoxFactory } from "./values_impl";
import { Restrictions } from "./restrictions";
import { RandomGenerator, RandomSource } from "./random";
import { createRuntimeProxy } from "./runtime-proxy";

export interface RuntimeOptions {
  /**
   * 为空（undefined）则使用默认作用域
   */
  topLevelScope: Scope;
  randomSource: RandomSource;
  restrictions: Restrictions;
  // TODO: noRepresentations
  // TODO: noStatistics
}

export interface RuntimeReporter {
  called?: () => RuntimeError | null;
  closureEnter?: () => RuntimeError | null;
  closureExit?: () => void;
}

interface StatisticsUnfinished {
  start?: { ms: number };
  calls?: number;
}

export interface ExecutionStatistics extends BasicExecutionStatistics {
  timeConsumption: { ms: number };
  calls?: number;
}

export type JSValue = number | boolean | JSValue[];

export interface ExecutionAppendix extends BasicExecutionAppendix {
  representation: Repr;
  statistics: ExecutionStatistics;
}

export type ExecutionResult =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "runtime", RuntimeError, ExecutionAppendix];

export class Runtime {
  private readonly _root: Node;

  private _topLevelScope: Scope;

  private _final: ValueBox | null = null;
  get executed() {
    return this._final !== null;
  }

  private _rng: RandomGenerator;

  private _restrictions: Restrictions;
  private _statistics: StatisticsUnfinished;
  reporter: RuntimeReporter;

  private _createConcreteValueBox: ConcreteValueBoxFactory;

  private _proxy: RuntimeProxy;

  constructor(root: Node, opts: RuntimeOptions) {
    this._root = root;

    this._topLevelScope = opts.topLevelScope;

    this._rng = new RandomGenerator(opts.randomSource);

    this._restrictions = opts.restrictions;
    const recordsCalls = this._restrictions.softTimeout !== undefined;
    // start, // 在 execute() 中赋值
    this._statistics = {
      ...(recordsCalls ? { calls: 0 } : {}),
    };

    this.reporter = {
      ...(recordsCalls ? { called: this._reportCalled.bind(this) } : {}),
    };

    this._proxy = createRuntimeProxy({
      random: this._rng,
      interpret: (scope, node) => this._interpret(scope, node),
      reporter: this.reporter,
    });

    this._createConcreteValueBox = new ConcreteValueBoxFactory(this._proxy);
  }

  private _reportCalled(): RuntimeError | null {
    this._statistics.calls!++;

    if (this._restrictions.softTimeout) {
      const timeout = this._restrictions.softTimeout;
      const interval = timeout.intervalPerCheck?.calls ?? 1;
      if (this._statistics.calls! % interval === 0) {
        const now = Date.now(); //performance.now();
        const duration = now - this._statistics.start!.ms;
        if (duration > timeout.ms) {
          const ms = timeout.ms;
          return createRuntimeError.restrictionExceeded("运行时间", "毫秒", ms);
        }
      }
    }
    return null;
  }

  execute(): ExecutionResult {
    this._statistics.start = { ms: Date.now() /*performance.now()*/ };

    const interpreted = this._interpretRoot();
    const result = getFinalValue(interpreted);

    const appendix = {
      representation: finalizeRepr(interpreted.getRepr()),
      statistics: {
        timeConsumption: {
          ms: Date.now() /*performance.now()*/ - this._statistics.start.ms,
        },
        calls: this._statistics.calls,
      },
    };
    return [...result, appendix];
  }

  private _interpretRoot(): ValueBox {
    if (this.executed) throw new Unimplemented();
    this._final = this._interpret(this._topLevelScope, this._root);
    return this._final;
  }

  private _interpret(scope: Scope, node: Node): ValueBox {
    if (typeof node === "string") {
      return this._interpretIdentifier(scope, node);
    }
    switch (node.kind) {
      case "value": {
        if (typeof node.value === "number" || typeof node.value === "boolean") {
          return this._createConcreteValueBox.literalPrimitive(node.value);
        }
        switch (node.value.valueKind) {
          case "list": {
            return this._interpretList(scope, node.value);
          }
          case "closure":
            return this._interpretClosure(scope, node.value);
          case "captured":
            return this._interpretCaptured(scope, node.value);
          default:
            throw new Unreachable();
        }
      }
      case "regular_call":
        return this._interpretRegularCall(scope, node);
      case "value_call":
        return this._interpretValueCall(scope, node);
      case "repetition":
        return this._interpretRepetition(scope, node);
      default:
        throw new Unreachable();
    }
  }

  private _interpretIdentifier(scope: Scope, ident: string): ValueBox {
    // FIXME: 为什么 `_` 有可能在 scope 里（虽然是 `undefined`）？
    if (ident in scope && scope[ident] !== undefined) {
      const thingInScope = scope[ident]!;
      if (
        typeof thingInScope === "function" ||
        thingInScope instanceof RegularFunctionAlias
      ) {
        throw new Unreachable();
      }
      return this._createConcreteValueBox.identifier(thingInScope, ident);
    } else {
      // FIXME: 这种情况应该 eager，因为有没有变量这里就能决定了
      // 也许可以在执行前检查下每个 scope 里的标识符、通常函数名是否存在于 scope 之中？
      const err = createRuntimeError.unknownVariable(ident);
      const errValue = this._createConcreteValueBox.error(err);
      return this._createConcreteValueBox.identifier(errValue, ident);
    }
  }

  private _interpretList(
    scope: Scope,
    list: NodeValue_List,
  ): ValueBox {
    const interpretedList = list.member.map((x) => this._interpret(scope, x));
    return this._createConcreteValueBox.literalList(interpretedList);
  }

  private _interpretClosure(
    scope: Scope,
    closure: NodeValue_Closure,
  ): ValueBox {
    return this._createConcreteValueBox.closure(
      closure.parameterIdentifiers,
      closure.body,
      scope,
      this._proxy,
      closure.raw,
    );
  }

  private _interpretCaptured(
    scope: Scope,
    captured: NodeValue_Captured,
  ): ValueBox {
    return this._createConcreteValueBox.captured(
      captured.identifier,
      captured.forceArity,
      scope,
      this._proxy,
    );
  }

  private _interpretRegularCall(
    scope: Scope,
    regularCall: Node_RegularCall,
  ): ValueBox {
    const args = regularCall.args.map((arg) => this._interpret(scope, arg));
    return this._createConcreteValueBox.callRegularFunction(
      scope,
      regularCall.name,
      args,
      regularCall.style,
      this._proxy,
    );
  }

  private _interpretValueCall(
    scope: Scope,
    valueCall: Node_ValueCall,
  ): ValueBox {
    const callee = this._interpret(scope, valueCall.variable);
    const args = valueCall.args.map((arg) => this._interpret(scope, arg));
    return this._createConcreteValueBox.callValue(
      callee,
      args,
      valueCall.style,
    );
  }

  private _interpretRepetition(
    scope: Scope,
    repetition: Node_Repetition,
  ): ValueBox {
    -0;
    const count = this._interpret(scope, repetition.count);
    const { body, bodyRaw } = repetition;
    return this._createConcreteValueBox.repetition(count, body, bodyRaw, scope);
  }
}

export interface RuntimeProxy extends RuntimeProxyForFunction {
  reporter: RuntimeReporter;

  interpret: (scope: Scope, node: Node) => ValueBox;
}

function getFinalValue(
  valueBox: ValueBox,
): ["ok", JSValue] | ["error", "runtime", RuntimeError] {
  const result = valueBox.get();
  if (result[0] === "error") return ["error", "runtime", result[1]];
  // result[0] === "ok"
  let value = asPlain(result[1]);

  switch (typeof value) {
    case "number":
    case "boolean":
      return ["ok", value];
    default: {
      if (value.type === "list") return getFinalValueOfList(value);
      const err = createRuntimeError.badFinalResult(getValueTypeName(value));
      return ["error", "runtime", err];
    }
  }
}

function getFinalValueOfList(
  list: Value_List,
): ["ok", JSValue] | ["error", "runtime", RuntimeError] {
  const resultList: JSValue = Array(list.length);
  for (const [i, elem] of list.entries()) {
    let result = getFinalValue(elem);
    if (result[0] === "error") return result;
    // result[0] === "ok"
    resultList[i] = result[1];
  }
  return ["ok", resultList];
}
