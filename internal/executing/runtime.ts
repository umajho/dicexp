import { Unimplemented, Unreachable } from "../../errors.ts";
import {
  FunctionCallStyle,
  Node,
  Node_Captured,
  Node_FunctionCall,
  NodeValue_Closure,
  NodeValue_List,
} from "../parsing/building_blocks.ts";
import { builtinScope } from "./builtin_functions.ts";
import {
  callableValue,
  ConcreteValue,
  concreteValue,
  errorValue,
  LazyValue,
  lazyValue,
  RuntimeValue,
} from "./evaluated_values.ts";
import { invokeAll } from "./helpers.ts";
import {
  RuntimeError,
  RuntimeError_UnknownFunction,
  RuntimeError_UnknownVariable,
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

  #eval(scope: Scope, node: Node | FunctionCall): RuntimeValue {
    if (typeof node === "string") {
      return this.#evalIdentifier(scope, node);
    }
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
            return this.#evalClosure(scope, node.value);
          default:
            throw new Unreachable();
        }
      }
      case "function_call":
      case "runtime_function_call": {
        return this.#evalFunctionCall(scope, node);
      }
      case "captured":
        return this.#evalCaptured(scope, node);
      default:
        throw new Unreachable();
    }
  }

  #evalIdentifier(scope: Scope, ident: string): RuntimeValue {
    if (ident in scope) {
      const value = scope[ident];
      if ("isRuntimeValue" in value && value.isRuntimeValue) return value;
      throw new Unreachable();
    } else {
      return errorValue(new RuntimeError_UnknownVariable(ident));
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

  #evalClosure(scope: Scope, closure: NodeValue_Closure): ConcreteValue {
    return callableValue("closure", (args, _style) => {
      // FIXME: step
      const deeperScope: Scope = Object.setPrototypeOf({}, scope);
      for (const [i, ident] of closure.parameterIdentifiers.entries()) {
        deeperScope[ident] = args[i];
      }
      return this.#eval(deeperScope, closure.body);
    }, closure.parameterIdentifiers.length);
  }

  #evalFunctionCall(
    scope: Scope,
    call: FunctionCall | Node_FunctionCall,
  ): LazyValue {
    return lazyValue(
      (args) => {
        let fullName = call.name;
        if (call.calleeKind === "function") {
          fullName += `/${args.length}`;
        }
        const fn = scope[fullName];
        if (fn === undefined) {
          return errorValue(new RuntimeError_UnknownFunction(fullName), [
            "TODO: step",
          ]);
        } else if (typeof fn !== "function") {
          throw new Unreachable();
        }

        // FIXME: style 应该是在真正执行时传进来的，这里暂时先用 `"regular"`
        return this.#call(scope, fn, args, "regular");
      },
      call.args,
      false,
    );
  }

  #evalCaptured(scope: Scope, captured: Node_Captured): ConcreteValue {
    return callableValue("captured", (args, style) => {
      // FIXME: step
      const ident = captured.identifier;
      const forceArity = captured.forceArity;
      return this.#evalFunctionCall(
        scope,
        runtimeFunctionCall("function", ident, args, style, forceArity),
      );
    }, captured.forceArity);
  }

  #call(
    scope: Scope,
    fn: Function,
    args: (Node | ConcreteValue)[],
    style: FunctionCallStyle,
  ): RuntimeValue {
    const evalFn = (node: Node | FunctionCall) => this.#eval(scope, node);
    const rtm = makeFunctionRuntime(scope, evalFn, this.rng);
    const executed = fn(args, style, rtm);
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
  evaluate: (node: Node | FunctionCall) => RuntimeValue;
  scope: Scope;
  random: RandomGenerator;
}

function makeFunctionRuntime(
  scope: Scope,
  evalFn: (node: Node | FunctionCall) => RuntimeValue,
  randomGenerator: RandomGenerator,
): FunctionRuntime {
  return {
    evaluate: evalFn,
    scope,
    random: randomGenerator,
  };
}

export interface FunctionCall {
  kind: "runtime_function_call";
  calleeKind: "function" | "variable";
  name: string;
  style: FunctionCallStyle;
  forceArity: number | undefined;
  args: (Node | ConcreteValue)[];
}

export function runtimeFunctionCall(
  calleeKind: FunctionCall["calleeKind"],
  name: string,
  args: (Node | ConcreteValue)[],
  style: FunctionCallStyle = "regular",
  forceArity: number | undefined = undefined,
): FunctionCall {
  return {
    kind: "runtime_function_call",
    calleeKind,
    name,
    forceArity,
    args,
    style,
  };
}
