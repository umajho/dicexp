import { Unimplemented, Unreachable } from "./errors";
import {
  Node,
  Node_Captured,
  Node_RegularCall,
  Node_ValueCall,
  NodeValue_Closure,
  NodeValue_List,
} from "@dicexp/nodes";
import { builtinScope } from "./builtin_functions";
import { RuntimeError, RuntimeError_UnknownVariable } from "./runtime_errors";
import {
  EitherStepOrError,
  EitherValueOrError,
  Step,
  Step_Final,
  Step_Identifier,
  Step_Literal,
  Step_LiteralList,
  Step_RegularCall,
  Step_ValueCall,
} from "./steps";
import { Value, Value_Captured, Value_Closure } from "./values";

export interface RandomGenerator {
  uint32(): number;
}

export interface RuntimeOptions {
  rng: RandomGenerator;
  // TODO: timeout
  // TODO: noSteps
}

export type JSValue = number | boolean | JSValue[];
export type EitherJSValueOrError = [JSValue, null] | [null, RuntimeError];

export class Runtime {
  private readonly _root: Node;

  private _finalStep: Step | null = null;
  get executed() {
    return this._finalStep !== null;
  }

  private _rng: RandomGenerator;

  private _functionRuntime: FunctionRuntime;

  constructor(root: Node, opts: RuntimeOptions) {
    this._root = root;
    this._rng = opts.rng;
    this._functionRuntime = {
      evaluate: (scope, node) => this._eval(scope, node),
      random: this._rng,
    };
  }

  executeAndTranslate(): [JSValue, null] | [null, RuntimeError] {
    const [value, err] = this.execute();
    if (err) return [null, err];
    return [this.translate(value), null];
  }

  translate(value: Value): JSValue {
    switch (typeof value) {
      case "number":
      case "boolean":
        return value;
      default:
        if (Array.isArray(value)) return this._translateList(value);
        // 经过 Step_Final，Closure 和 Captured 不会出现；
        // Calling 也不应该出现在这里
        throw new Unreachable();
    }
  }

  private _translateList(list: Step[]): JSValue {
    const resultList: JSValue = Array(list.length);
    for (const [i, elem] of list.entries()) {
      if (Array.isArray(elem)) {
        resultList[i] = this._translateList(elem);
      } else {
        const [value, err] = elem.result;
        if (err) throw new Unreachable();
        resultList[i] = this.translate(value);
      }
    }
    return resultList;
  }

  execute(): EitherValueOrError {
    if (this.executed) {
      throw new Unimplemented();
    }
    this._finalStep = new Step_Final(this._eval(builtinScope, this._root));
    return this._finalStep.result;
  }

  private _eval(scope: Scope, node: Node): Step {
    if (typeof node === "string") {
      return this._evalIdentifier(scope, node);
    }
    switch (node.kind) {
      case "value": {
        if (typeof node.value === "number" || typeof node.value === "boolean") {
          return new Step_Literal(node.value);
        }
        switch (node.value.valueKind) {
          case "list": {
            return this._evalList(scope, node.value);
          }
          case "closure":
            return this._evalClosure(scope, node.value);
          default:
            throw new Unreachable();
        }
      }
      case "regular_call":
        return this._evaluateRegularCall(scope, node);
      case "value_call":
        return this._evaluateValueCall(scope, node);
      case "captured":
        return this._evalCaptured(scope, node);
      default:
        throw new Unreachable();
    }
  }

  private _evalIdentifier(scope: Scope, ident: string): Step_Identifier {
    // FIXME: 为什么 `_` 有可能在 scope 里（虽然是 `undefined`）？
    if (ident in scope && scope[ident] !== undefined) {
      const stepInScope = scope[ident];
      if (typeof stepInScope === "function") throw new Unreachable();
      return new Step_Identifier(ident, stepInScope);
    } else {
      // FIXME: 这种情况应该 eager，因为有没有变量这里就能决定了
      // 也许可以在执行前检查下每个 scope 里的标识符、通常函数名是否存在于 scope 之中？
      const err = new RuntimeError_UnknownVariable(ident);
      return new Step_Identifier(ident, err);
    }
  }

  private _evalList(scope: Scope, list: NodeValue_List): Step_LiteralList {
    return new Step_LiteralList(list.member.map((x) => this._eval(scope, x)));
  }

  private _evalClosure(scope: Scope, closure: NodeValue_Closure): Step_Literal {
    const closureValue = new Value_Closure(
      scope,
      closure.parameterIdentifiers,
      closure.body,
      this._functionRuntime,
    );
    return new Step_Literal(closureValue);
  }

  private _evaluateRegularCall(
    scope: Scope,
    regularCall: Node_RegularCall,
  ): Step_RegularCall {
    const args = regularCall.args.map((arg) => this._eval(scope, arg));
    return new Step_RegularCall(
      scope,
      regularCall.name,
      args,
      regularCall.style,
      this._functionRuntime,
    );
  }

  private _evaluateValueCall(
    scope: Scope,
    valueCall: Node_ValueCall,
  ): Step_ValueCall {
    const callee = this._eval(scope, valueCall.variable);
    const args = valueCall.args.map((arg) => this._eval(scope, arg));
    return new Step_ValueCall(callee, args);
  }

  private _evalCaptured(scope: Scope, captured: Node_Captured): Step_Literal {
    const capturedValue = new Value_Captured(
      scope,
      captured.identifier,
      captured.forceArity,
      this._functionRuntime,
    );
    return new Step_Literal(capturedValue);
  }
}

export type Scope = { [ident: string]: RegularFunction | Step };

export type RegularFunctionReturnValue =
  | EitherStepOrError
  | { result: EitherStepOrError; replacingStep: Step };

export type RegularFunction = (
  args: Step[],
  rtm: FunctionRuntime,
) => RegularFunctionReturnValue;

export interface FunctionRuntime {
  evaluate: (scope: Scope, node: Node) => Step; // TODO: 似乎没必要？
  random: RandomGenerator;
}
