import { Unimplemented, Unreachable } from "./errors";
import type {
  Node,
  Node_RegularCall,
  Node_ValueCall,
  NodeValue_Captured,
  NodeValue_Closure,
  NodeValue_List,
} from "@dicexp/nodes";
import { builtinScope } from "./builtin_functions";
import {
  RuntimeError,
  RuntimeError_BadFinalResult,
  RuntimeError_UnknownVariable,
} from "./runtime_errors";
import {
  callRegularFunction,
  callValue,
  delazy,
  getTypeNameOfValue,
  type LazyValue,
  lazyValue_captured,
  lazyValue_closure,
  lazyValue_error,
  lazyValue_identifier,
  lazyValue_list,
  lazyValue_literal,
  type RuntimeResult,
  type YieldedLazyValue,
} from "./values";

export interface RandomGenerator {
  uint32(): number;
}

export interface RuntimeOptions {
  rng: RandomGenerator;
  // TODO: timeout
  // TODO: noRepresentations
}

export type JSValue = number | boolean | JSValue[];
export type EitherJSValueOrError = [JSValue, null] | [null, RuntimeError];

export class Runtime {
  private readonly _root: Node;

  private _final: YieldedLazyValue | null = null;
  get executed() {
    return this._final !== null;
  }

  private _rng: RandomGenerator;

  private _functionRuntime: FunctionRuntime;

  constructor(root: Node, opts: RuntimeOptions) {
    this._root = root;
    this._rng = opts.rng;
    this._functionRuntime = {
      // value 都会是新的，因此没必要 reevaluate
      interpret: (scope, node) => this._interpret(scope, node, false),
      random: this._rng,
    };
  }

  // TODO: return { representation } & ( { value } | { runtimeError } | { unknownError } )
  executeAndTranslate(): EitherJSValueOrError {
    const value = this._interpretRoot();
    const [jsValue, err] = this._finalize(value);
    if (err) return [null, err];
    return [jsValue, null];
  }

  private _finalize(value: LazyValue): EitherJSValueOrError {
    const concrete = delazy(value, false).concrete;
    if ("error" in concrete.value) {
      return [null, concrete.value.error];
    }
    const okValue = concrete.value.ok;

    switch (typeof okValue) {
      case "number":
      case "boolean":
        return [okValue, null];
      default:
        if (Array.isArray(okValue)) return this._finalizeList(okValue);
        return [
          null,
          new RuntimeError_BadFinalResult(getTypeNameOfValue(okValue)),
        ];
    }
  }

  private _finalizeList(list: LazyValue[]): EitherJSValueOrError {
    const resultList: JSValue = Array(list.length);
    for (const [i, elem] of list.entries()) {
      let [v, err] = (() => {
        if (Array.isArray(elem)) {
          return this._finalizeList(elem);
        } else {
          return this._finalize(elem);
        }
      })();
      if (err) return [null, err];
      resultList[i] = v!;
    }
    return [resultList, null];
  }

  private _interpretRoot(): YieldedLazyValue {
    if (this.executed) {
      throw new Unimplemented();
    }
    const final = this._interpret(builtinScope, this._root, false);
    this._final = delazy(final, false);
    return this._final;
  }

  private _interpret(scope: Scope, node: Node, reevaluate: boolean): LazyValue {
    if (typeof node === "string") {
      return this._interpretIdentifier(scope, node);
    }
    switch (node.kind) {
      case "value": {
        if (typeof node.value === "number" || typeof node.value === "boolean") {
          return lazyValue_literal(node.value);
        }
        switch (node.value.valueKind) {
          case "list": {
            return this._interpretList(scope, node.value, reevaluate);
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
        return this._interpretValueCall(scope, node, reevaluate);
      default:
        throw new Unreachable();
    }
  }

  private _interpretIdentifier(scope: Scope, ident: string): LazyValue {
    // FIXME: 为什么 `_` 有可能在 scope 里（虽然是 `undefined`）？
    if (ident in scope && scope[ident] !== undefined) {
      const thingInScope = scope[ident];
      if (typeof thingInScope === "function") throw new Unreachable();
      return lazyValue_identifier(thingInScope, ident);
    } else {
      // FIXME: 这种情况应该 eager，因为有没有变量这里就能决定了
      // 也许可以在执行前检查下每个 scope 里的标识符、通常函数名是否存在于 scope 之中？
      const err = new RuntimeError_UnknownVariable(ident);
      return lazyValue_identifier(lazyValue_error(err), ident);
    }
  }

  private _interpretList(
    scope: Scope,
    list: NodeValue_List,
    reevaluate: boolean,
  ): LazyValue {
    return lazyValue_list(
      list.member.map((x) => this._interpret(scope, x, reevaluate)),
    );
  }

  private _interpretClosure(
    scope: Scope,
    closure: NodeValue_Closure,
  ): LazyValue {
    return lazyValue_closure(
      closure.parameterIdentifiers,
      closure.body,
      scope,
      this._functionRuntime,
    );
  }

  private _interpretCaptured(
    scope: Scope,
    captured: NodeValue_Captured,
  ): LazyValue {
    return lazyValue_captured(
      captured.identifier,
      captured.forceArity,
      scope,
      this._functionRuntime,
    );
  }

  private _interpretRegularCall(
    scope: Scope,
    regularCall: Node_RegularCall,
  ): LazyValue {
    const args = regularCall.args.map((arg) =>
      this._interpret(scope, arg, true)
    );
    return callRegularFunction(
      scope,
      regularCall.name,
      args,
      regularCall.style,
      this._functionRuntime,
    );
  }

  private _interpretValueCall(
    scope: Scope,
    valueCall: Node_ValueCall,
    reevaluate: boolean,
  ): LazyValue {
    const callee = this._interpret(scope, valueCall.variable, reevaluate);
    const args = valueCall.args.map((arg) => this._interpret(scope, arg, true));
    return callValue(callee, args, valueCall.style, reevaluate);
  }
}

export type Scope = { [ident: string]: RegularFunction | LazyValue };

export type RegularFunction = (
  args: LazyValue[],
  rtm: FunctionRuntime,
) => RuntimeResult<LazyValue>;

export interface FunctionRuntime {
  interpret: (scope: Scope, node: Node) => LazyValue; // TODO: 似乎没必要？
  random: RandomGenerator;
}
