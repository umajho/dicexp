import { Unimplemented, Unreachable } from "./errors";
import type {
  Node,
  Node_RegularCall,
  Node_ValueCall,
  NodeValue_Captured,
  NodeValue_Closure,
  NodeValue_List,
} from "@dicexp/nodes";
import { builtinScope } from "./builtin_functions/mod";
import {
  RuntimeError,
  RuntimeError_BadFinalResult,
  RuntimeError_RestrictionExceeded,
  RuntimeError_UnknownVariable,
} from "./runtime_errors";
import {
  type Concrete,
  concretize,
  getTypeNameOfValue,
  type LazyValue,
  LazyValueFactory,
  type Representation,
  type RuntimeResult,
  type Value_List,
} from "./values";
import type { Restrictions } from "./restrictions";

export interface RandomGenerator {
  uint32(): number;
}

export interface RuntimeOptions {
  /**
   * 为空（undefined）则使用默认作用域
   */
  topLevelScope?: Scope;
  rng: RandomGenerator;
  restrictions: Restrictions;
  // TODO: noRepresentations
  // TODO: noStatistics
}

export interface RuntimeReporter {
  concreted: (memoed: boolean) => RuntimeError | null;
  closureCalled?: () => RuntimeError | null;
  closureLeaved?: () => void;
}

export interface Statistics {
  start?: { ms: number };
  timeConsumption?: { ms: number };
  cretizations: {
    all: number;
    nonMemoed: number;
  };
}

export type JSValue = number | boolean | JSValue[];

export type ExecutionResult = RuntimeResult<JSValue> & {
  representation: Representation;
  statistics: Required<Statistics>;
};

export class Runtime {
  private readonly _root: Node;

  private _topLevelScope: Scope;

  private _final: Concrete | null = null;
  get executed() {
    return this._final !== null;
  }

  private _rng: RandomGenerator;

  private _restrictions: Restrictions;
  private _statistics: Statistics;
  reporter: RuntimeReporter;
  private _closureCallLevel = 0;

  private _lazyValueFactory: LazyValueFactory;

  private _proxy: RuntimeProxy;

  constructor(root: Node, opts: RuntimeOptions) {
    this._root = root;

    this._topLevelScope = opts.topLevelScope ?? builtinScope;

    this._rng = opts.rng;

    this._restrictions = opts.restrictions;
    this._statistics = {
      // start, // 在 execute() 中赋值
      cretizations: { all: 0, nonMemoed: 0 },
    };
    this.reporter = {
      concreted: this._reportConcretization.bind(this),
      ...(this._restrictions.maxClosureCallDepth
        ? {
          closureCalled: this._reportClosureCalled.bind(this),
          closureLeaved: this._reportClosureCallLeaved.bind(this),
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
    this._proxy.lazyValueFactory = this._lazyValueFactory;
  }

  private _reportConcretization(memoed: boolean): RuntimeError | null {
    this._statistics.cretizations.all++;
    if (!memoed) {
      this._statistics.cretizations.nonMemoed++;
    }
    if (!this._restrictions) return null;

    if (this._restrictions.maxNonMemoedConcretizations) {
      const max = this._restrictions.maxNonMemoedConcretizations;
      const cur = this._statistics.cretizations.nonMemoed;
      if (cur > max) {
        const rName = "步骤数（大致）";
        return new RuntimeError_RestrictionExceeded(rName, "步", max);
      }
    }
    if (this._restrictions.softTimeout) {
      const timeout = this._restrictions.softTimeout;
      const interval = timeout.intervalPerCheck?.concretizations ?? 1;
      if (this._statistics.cretizations.all % interval === 0) {
        const now = Date.now(); //performance.now();
        const duration = now - this._statistics.start!.ms;
        if (duration > timeout.ms) {
          const ms = timeout.ms;
          return new RuntimeError_RestrictionExceeded("运行时间", "毫秒", ms);
        }
      }
    }

    return null;
  }
  private _reportClosureCalled() {
    this._closureCallLevel++;
    const max = this._restrictions.maxClosureCallDepth!;
    if (this._closureCallLevel > max) {
      return new RuntimeError_RestrictionExceeded("闭包递归深度", "层", max);
    }
    return null;
  }
  private _reportClosureCallLeaved() {
    this._closureCallLevel--;
  }

  execute(): ExecutionResult {
    this._statistics.start = { ms: Date.now() /*performance.now()*/ };
    const concrete = this._interpretRoot();
    const result = this._finalize({ memo: concrete });
    this._statistics.timeConsumption = {
      ms: Date.now() /*performance.now()*/ - this._statistics.start.ms,
    };
    return {
      ...result,
      representation: concrete.representation,
      statistics: this._statistics as Required<Statistics>,
    };
  }

  private _finalize(value: LazyValue): RuntimeResult<JSValue> {
    const concrete = concretize(value, this._proxy);
    if ("error" in concrete.value) {
      return concrete.value;
    }
    const okValue = concrete.value.ok;

    switch (typeof okValue) {
      case "number":
      case "boolean":
        return { ok: okValue };
      default:
        if (Array.isArray(okValue)) return this._finalizeList(okValue);
        return {
          error: new RuntimeError_BadFinalResult(getTypeNameOfValue(okValue)),
        };
    }
  }

  private _finalizeList(list: Value_List): RuntimeResult<JSValue> {
    const resultList: JSValue = Array(list.length);
    for (const [i, elem] of list.entries()) {
      let result = (() => {
        if (Array.isArray(elem)) {
          return this._finalizeList(elem);
        } else {
          return this._finalize(elem);
        }
      })();
      if ("error" in result) return result;
      resultList[i] = result.ok;
    }
    return { ok: resultList };
  }

  private _interpretRoot(): Concrete {
    if (this.executed) {
      throw new Unimplemented();
    }
    const final = this._interpret(this._topLevelScope, this._root);
    this._final = concretize(final, this._proxy);
    return this._final;
  }

  private _interpret(scope: Scope, node: Node): LazyValue {
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
      default:
        throw new Unreachable();
    }
  }

  private _interpretIdentifier(scope: Scope, ident: string): LazyValue {
    // FIXME: 为什么 `_` 有可能在 scope 里（虽然是 `undefined`）？
    if (ident in scope && scope[ident] !== undefined) {
      const thingInScope = scope[ident];
      if (typeof thingInScope === "function") throw new Unreachable();
      return this._lazyValueFactory.identifier(thingInScope, ident);
    } else {
      // FIXME: 这种情况应该 eager，因为有没有变量这里就能决定了
      // 也许可以在执行前检查下每个 scope 里的标识符、通常函数名是否存在于 scope 之中？
      const err = new RuntimeError_UnknownVariable(ident);
      const errValue = this._lazyValueFactory.error(err);
      return this._lazyValueFactory.identifier(errValue, ident);
    }
  }

  private _interpretList(
    scope: Scope,
    list: NodeValue_List,
  ): LazyValue {
    const interpretedList = list.member.map((x) => this._interpret(scope, x));
    return this._lazyValueFactory.list(interpretedList);
  }

  private _interpretClosure(
    scope: Scope,
    closure: NodeValue_Closure,
  ): LazyValue {
    return this._lazyValueFactory.closure(
      closure.parameterIdentifiers,
      closure.body,
      scope,
      this._proxy,
    );
  }

  private _interpretCaptured(
    scope: Scope,
    captured: NodeValue_Captured,
  ): LazyValue {
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
  ): LazyValue {
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
  ): LazyValue {
    const callee = this._interpret(scope, valueCall.variable);
    const args = valueCall.args.map((arg) => this._interpret(scope, arg));
    return this._lazyValueFactory.callValue(callee, args, valueCall.style);
  }
}

export type Scope = { [ident: string]: RegularFunction | LazyValue };

export type RegularFunction = (
  args: Value_List,
  rtm: RuntimeProxy,
) => RuntimeResult<LazyValue>;

export interface RuntimeProxy {
  interpret: (scope: Scope, node: Node) => LazyValue; // TODO: 似乎没必要？
  random: RandomGenerator;
  lazyValueFactory: LazyValueFactory;
  reporter: RuntimeReporter;
}
