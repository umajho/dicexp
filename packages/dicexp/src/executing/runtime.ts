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
  runtimeError_badFinalResult,
  runtimeError_restrictionExceeded,
  runtimeError_unknownVariable,
} from "@dicexp/runtime/errors";
import { LazyValueFactory } from "./values_impl";
import { Restrictions } from "./restrictions";
import { RandomGenerator, RandomSource } from "./random";
import { Unimplemented, Unreachable } from "@dicexp/errors";
import {
  asPlain,
  getTypeNameOfValue,
  Repr,
  RuntimeError,
  RuntimeProxyForFunction,
  Scope,
  Value_List,
  ValueBox,
} from "@dicexp/runtime/values";

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
  closureCallDepth?: number;
  maxClosureCallDepth?: number;
}

export interface Statistics {
  timeConsumption: { ms: number };
  calls?: number;
  maxClosureCallDepth?: number;
}

export type JSValue = number | boolean | JSValue[];

export interface ExecutionAppendix {
  representation: Repr;
  statistics: Statistics;
}

export type ExecutionResult =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", RuntimeError, ExecutionAppendix];

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

  private _lazyValueFactory: LazyValueFactory;

  private _proxy: RuntimeProxy;

  constructor(root: Node, opts: RuntimeOptions) {
    this._root = root;

    this._topLevelScope = opts.topLevelScope;

    this._rng = new RandomGenerator(opts.randomSource);

    this._restrictions = opts.restrictions;
    const recordsCalls = this._restrictions.maxCalls !== undefined ||
        this._restrictions.softTimeout !== undefined,
      recordsClosureCallDepth =
        this._restrictions.maxClosureCallDepth !== undefined;
    // start, // 在 execute() 中赋值
    this._statistics = {
      ...(recordsCalls ? { calls: 0 } : {}),
      ...(recordsClosureCallDepth
        ? { closureCallDepth: 0, maxClosureCallDepth: 0 }
        : {}),
    };

    this.reporter = {
      ...(recordsCalls ? { called: this._reportCalled.bind(this) } : {}),
      ...(recordsClosureCallDepth
        ? {
          closureEnter: this._reportClosureEnter.bind(this),
          closureExit: this._reportClosureExit.bind(this),
        }
        : {}),
    };

    this._proxy = {
      interpret: (scope, node) => this._interpret(scope, node),
      random: this._rng,
      // @ts-ignore
      lazyValueFactory: null, // 之后才有，所以之后再赋值
      reporter: this.reporter,
    };

    this._lazyValueFactory = new LazyValueFactory(this._proxy);
  }

  private _reportCalled(): RuntimeError | null {
    this._statistics.calls!++;

    if (this._restrictions.maxCalls !== undefined) {
      const max = this._restrictions.maxCalls!;
      if (this._statistics.calls! > max) {
        return runtimeError_restrictionExceeded("调用次数", "次", max);
      }
    }

    if (this._restrictions.softTimeout) {
      const timeout = this._restrictions.softTimeout;
      const interval = timeout.intervalPerCheck?.calls ?? 1;
      if (this._statistics.calls! % interval === 0) {
        const now = Date.now(); //performance.now();
        const duration = now - this._statistics.start!.ms;
        if (duration > timeout.ms) {
          const ms = timeout.ms;
          return runtimeError_restrictionExceeded("运行时间", "毫秒", ms);
        }
      }
    }
    return null;
  }
  private _reportClosureEnter(): RuntimeError | null {
    this._statistics.closureCallDepth!++;

    const current = this._statistics.closureCallDepth!;
    if (current > this._statistics.maxClosureCallDepth!) {
      this._statistics.maxClosureCallDepth = current;
      const max = this._restrictions.maxClosureCallDepth!;
      if (current > max) {
        return runtimeError_restrictionExceeded("闭包调用深度", "层", max);
      }
    }

    return null;
  }
  private _reportClosureExit(): void {
    this._statistics.closureCallDepth!--;
  }

  execute(): ExecutionResult {
    this._statistics.start = { ms: Date.now() /*performance.now()*/ };

    const interpreted = this._interpretRoot();
    const result = this._finalize(interpreted);

    const repr = interpreted.getRepr();
    repr.finalize();

    const appendix = {
      representation: repr,
      statistics: {
        timeConsumption: {
          ms: Date.now() /*performance.now()*/ - this._statistics.start.ms,
        },
        calls: this._statistics.calls,
        maxClosureCallDepth: this._statistics.maxClosureCallDepth,
      },
    };
    return [...result, appendix];
  }

  private _finalize(
    valueBox: ValueBox,
  ): ["ok", JSValue] | ["error", RuntimeError] {
    const result = valueBox.get();
    if (result[0] === "error") return result;
    // result[0] === "ok"
    let value = asPlain(result[1]);

    switch (typeof value) {
      case "number":
      case "boolean":
        return ["ok", value];
      default: {
        if (Array.isArray(value)) return this._finalizeList(value);
        const err = runtimeError_badFinalResult(getTypeNameOfValue(value));
        return ["error", err];
      }
    }
  }

  private _finalizeList(
    list: Value_List,
  ): ["ok", JSValue] | ["error", RuntimeError] {
    const resultList: JSValue = Array(list.length);
    for (const [i, elem] of list.entries()) {
      let result: ["ok", JSValue] | ["error", RuntimeError];
      if (Array.isArray(elem)) {
        result = this._finalizeList(elem);
      } else {
        result = this._finalize(elem);
      }
      if (result[0] === "error") return result;
      // result[0] === "ok"
      resultList[i] = result[1];
    }
    return ["ok", resultList];
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
          return this._lazyValueFactory.literal(node.value);
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
      const thingInScope = scope[ident];
      if (typeof thingInScope === "function") throw new Unreachable();
      return this._lazyValueFactory.identifier(thingInScope, ident);
    } else {
      // FIXME: 这种情况应该 eager，因为有没有变量这里就能决定了
      // 也许可以在执行前检查下每个 scope 里的标识符、通常函数名是否存在于 scope 之中？
      const err = runtimeError_unknownVariable(ident);
      const errValue = this._lazyValueFactory.error(err);
      return this._lazyValueFactory.identifier(errValue, ident);
    }
  }

  private _interpretList(
    scope: Scope,
    list: NodeValue_List,
  ): ValueBox {
    const interpretedList = list.member.map((x) => this._interpret(scope, x));
    return this._lazyValueFactory.list(interpretedList);
  }

  private _interpretClosure(
    scope: Scope,
    closure: NodeValue_Closure,
  ): ValueBox {
    return this._lazyValueFactory.closure(
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
    return this._lazyValueFactory.captured(
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
    return this._lazyValueFactory.callRegularFunction(
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
    return this._lazyValueFactory.callValue(callee, args, valueCall.style);
  }

  private _interpretRepetition(
    scope: Scope,
    repetition: Node_Repetition,
  ): ValueBox {
    -0;
    const count = this._interpret(scope, repetition.count);
    return this._lazyValueFactory.repetition(
      count,
      repetition.body,
      repetition.bodyRaw,
      scope,
    );
  }
}

export interface RuntimeProxy extends RuntimeProxyForFunction {
  reporter: RuntimeReporter;

  interpret: (scope: Scope, node: Node) => ValueBox;
}
