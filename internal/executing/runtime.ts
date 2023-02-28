import { Unimplemented, Unreachable } from "../../errors.ts";
import {
  functionCall,
  FunctionCallStyle,
  Node,
  Node_Captured,
  Node_FunctionCall,
  NodeValue_List,
} from "../parsing/building_blocks.ts";
import { builtinScope } from "./builtin_functions.ts";
import {
  callableValue,
  ConcreteValue,
  concreteValue,
  LazyValue,
  lazyValue,
  RuntimeValue,
} from "./evaluated_values.ts";
import { invokeAll } from "./helpers.ts";
import {
  RuntimeError,
  RuntimeError_NotAFunction,
  RuntimeError_UnknownIdentifier,
} from "./runtime_errors.ts";

export interface RandomGenerator {
  int32(): number;
}

export interface RuntimeOptions {
  rng: RandomGenerator;
  // TODO: timeout
}

export type ResultValue = number | boolean | ResultValue[];

export class Runtime {
  root: Node;

  executed = false;

  rng: RandomGenerator;

  constructor(root: Node, opts: RuntimeOptions) {
    this.root = root;
    this.rng = opts.rng;
  }

  executeAndTranslate(): ResultValue | RuntimeError {
    const result = this.execute();
    if (result.kind === "error") return result.error;
    return this.translate(result);
  }

  translate(runtimeValue: RuntimeValue): ResultValue {
    switch (runtimeValue.kind) {
      case "concrete":
        switch (typeof runtimeValue.value) {
          case "number":
          case "boolean":
            return runtimeValue.value;
          default:
            if (Array.isArray(runtimeValue.value)) {
              return this.#translateList(runtimeValue.value);
            } else if (runtimeValue.value.kind === "callable") {
              throw new Unimplemented();
            }
            throw new Unreachable();
        }
        break;
      case "lazy":
      case "error":
        throw new Unreachable();
    }
  }

  #translateList(list: ConcreteValue[]): ResultValue {
    const resultList: ResultValue = Array(list.length);
    for (const [i, elem] of list.entries()) {
      if (Array.isArray(elem)) {
        resultList[i] = this.#translateList(elem);
      } else {
        resultList[i] = this.translate(elem);
      }
    }
    return resultList;
  }

  execute(): RuntimeValue {
    if (this.executed) {
      throw new Unimplemented();
    }
    this.executed = true;
    const outermost = this.#eval(builtinScope, this.root);
    return invokeAll(outermost);
  }

  #eval(scope: Scope, node: Node): RuntimeValue {
    if (typeof node === "string") throw new Unimplemented();
    switch (node.kind) {
      case "value": {
        if (typeof node.value === "number" || typeof node.value === "boolean") {
          return concreteValue(node.value, [`${node.value}`]);
        }
        switch (node.value.valueKind) {
          case "list": {
            return this.#evalList(scope, node.value);
          }
          case "closure":
            throw new Unimplemented();
          default:
            throw new Unreachable();
        }
      }
      case "function_call": {
        return this.#evalFunctionCall(scope, node);
      }
      case "closure_call":
        throw new Unimplemented();
      case "captured":
        return this.#evalCaptured(scope, node);
      default:
        throw new Unreachable();
    }
  }

  #evalList(scope: Scope, list: NodeValue_List): ConcreteValue {
    const listEvaluated = [];
    for (const elemNode of list.member) {
      const elemEvaluated = invokeAll(this.#eval(scope, elemNode));
      if (elemEvaluated.kind === "error") {
        throw new Unimplemented();
      }
      listEvaluated.push(elemEvaluated);
    }
    return concreteValue(listEvaluated, ["TODO: step for list"]);
  }

  #evalFunctionCall(scope: Scope, call: Node_FunctionCall): LazyValue {
    return lazyValue(
      (args) => {
        return this.#callFunction(
          scope,
          call.identifier,
          args,
          call.style,
          call.forceArity,
        );
      },
      call.args,
      false,
    );
  }

  #evalCaptured(scope: Scope, captured: Node_Captured): ConcreteValue {
    return callableValue("captured", (args, style) => {
      // FIXME: step
      return this.#evalFunctionCall(
        scope,
        functionCall(captured.identifier, args, style, captured.forceArity),
      );
    }, captured.forceArity);
  }

  #callFunction(
    scope: Scope,
    identifier: string,
    args: (Node | ConcreteValue)[],
    style: FunctionCallStyle,
    forceArity: number | undefined,
  ) {
    if (forceArity !== undefined && forceArity !== args.length) {
      throw new Unimplemented();
    }

    const fullIdent = `${identifier}/${args.length}`;
    const fn = scope[fullIdent];
    if (!fn) {
      throw new RuntimeError_UnknownIdentifier(fullIdent);
    } else if (typeof fn !== "function") {
      // FIXME: 由于有 arity 标记，不可能会走到这里吧
      throw new RuntimeError_NotAFunction(fullIdent);
    }
    const evalFn = (node: Node) => this.#eval(scope, node);
    const executed = fn(
      args,
      style,
      makeFunctionRuntime(scope, evalFn, this.rng),
    );
    return executed.result;
  }
}

export type Scope = { [ident: string]: Function | RuntimeValue };

export type Function = (
  params: (Node | ConcreteValue)[],
  style: FunctionCallStyle,
  runtime: FunctionRuntime,
) => { result: RuntimeValue };

export interface FunctionRuntime {
  evaluate: (node: Node) => RuntimeValue;
  scope: Scope;
  random: RandomGenerator;
}

function makeFunctionRuntime(
  scope: Scope,
  evalFn: (node: Node) => RuntimeValue,
  randomGenerator: RandomGenerator,
): FunctionRuntime {
  return {
    evaluate: evalFn,
    scope,
    random: randomGenerator,
  };
}
