import { Unimplemented, Unreachable } from "../../errors.ts";
import {
  calleeFunction,
  FunctionCallStyle,
  Node,
  Node_Call,
  Node_Captured,
  NodeValue_Closure,
  NodeValue_List,
} from "../parsing/building_blocks.ts";
import { builtinScope } from "./builtin_functions.ts";
import {
  asCallable,
  Callable,
  callableValue,
  ConcreteValue,
  concreteValue,
  errorValue,
  LazyValue,
  lazyValue,
  Value,
} from "./values.ts";
import {
  evaluateParameters,
  invokeAll,
  renderCallableName,
} from "./helpers.ts";
import {
  RuntimeError,
  RuntimeError_DuplicateClosureParameterNames,
  RuntimeError_NotCallable,
  RuntimeError_UnknownFunction,
  RuntimeError_UnknownVariable,
  RuntimeError_WrongArity,
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

  translate(runtimeValue: Value): ResultValue {
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

  execute(): Value {
    if (this.executed) {
      throw new Unimplemented();
    }
    this.executed = true;
    const outermost = this.#eval(builtinScope, this.root);
    return invokeAll(outermost);
  }

  #eval(scope: Scope, node: Node | Call): Value {
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
      case "call":
      case "runtime_call": {
        return this.#evalFunctionCall(scope, node);
      }
      case "captured":
        return this.#evalCaptured(scope, node);
      default:
        throw new Unreachable();
    }
  }

  #evalIdentifier(scope: Scope, ident: string): Value {
    // FIXME: 为什么 `_` 有可能在 scope 里（虽然是 `undefined`）？
    if (ident in scope && scope[ident] !== undefined) {
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
    const value = callableValue("closure", (args, _style) => {
      // FIXME: step

      if (closure.parameterIdentifiers.length !== args.length) {
        return errorValue(
          new RuntimeError_WrongArity(
            renderCallableName(value.value as Callable), // FIXME: 太曲折了
            closure.parameterIdentifiers.length,
            args.length,
          ),
        );
      }

      const deeperScope: Scope = Object.setPrototypeOf({}, scope);
      for (const [i, ident] of closure.parameterIdentifiers.entries()) {
        if (ident === "_") continue;
        if (Object.hasOwn(deeperScope, ident)) {
          return errorValue(
            new RuntimeError_DuplicateClosureParameterNames(ident),
          );
        }
        deeperScope[ident] = args[i];
      }
      return this.#eval(deeperScope, closure.body);
    }, closure.parameterIdentifiers.length);

    return value;
  }

  #evalFunctionCall(
    scope: Scope,
    call: Call | Node_Call,
  ): LazyValue {
    return lazyValue(
      (args) => {
        const fn = this.#getFunctionFromCall(scope, call, args.length);
        if (typeof fn === "object" && fn instanceof RuntimeError) {
          return errorValue(fn);
        }

        if (typeof fn === "function") {
          // FIXME: style 应该是在真正执行时传进来的，这里暂时先用 `"regular"`
          return this.#call(scope, fn, args, "regular");
        } else {
          const [evaluatedParams, error] = evaluateParameters(
            this.#evalFn(scope),
            renderCallableName(fn),
            args,
            undefined,
          );
          if (error) {
            return errorValue(error, ["TODO: step"]);
          }

          return fn.call(evaluatedParams, "regular");
        }
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
        runtimeCall(calleeFunction(ident), args, style, forceArity),
      );
    }, captured.forceArity);
  }

  #getFunctionFromCall(
    scope: Scope,
    call: Call | Node_Call,
    arity: number,
  ): Function | Callable | RuntimeError {
    if (call.callee.calleeKind === "function") {
      const fullName = `${call.callee.name}/${arity}`;
      const fn = scope[fullName];
      if (fn === undefined) {
        return new RuntimeError_UnknownFunction(fullName);
      }
      if (typeof fn !== "function") {
        throw new Unreachable();
      }
      return fn;
    } else if (call.callee.calleeKind === "exp") {
      const value = invokeAll(this.#eval(scope, call.callee.node));
      if (value.kind === "error") {
        return value.error; // FIXME: step
      }
      const callable = asCallable(value);
      if (callable instanceof RuntimeError) {
        return callable;
      }
      if (!callable) {
        return new RuntimeError_NotCallable("（TODO: name）");
      }
      return callable;
    } else {
      throw new Unreachable();
    }
  }

  #call(
    scope: Scope,
    fn: Function,
    args: (Node | ConcreteValue)[],
    style: FunctionCallStyle,
  ): Value {
    const rtm = makeFunctionRuntime(scope, this.#evalFn(scope), this.rng);
    const executed = fn(args, style, rtm);
    return executed.result;
  }

  #evalFn(scope: Scope) {
    return (node: Node | Call) => this.#eval(scope, node);
  }
}

export type Scope = { [ident: string]: Function | Value };

export type Function = (
  params: (Node | ConcreteValue)[],
  style: FunctionCallStyle,
  runtime: FunctionRuntime,
) => { result: Value };

export interface FunctionRuntime {
  evaluate: (node: Node | Call) => Value;
  scope: Scope;
  random: RandomGenerator;
}

function makeFunctionRuntime(
  scope: Scope,
  evalFn: (node: Node | Call) => Value,
  randomGenerator: RandomGenerator,
): FunctionRuntime {
  return {
    evaluate: evalFn,
    scope,
    random: randomGenerator,
  };
}

export interface Call {
  kind: "runtime_call";
  callee: Node_Call["callee"];
  style: FunctionCallStyle;
  forceArity: number | undefined;
  args: (Node | ConcreteValue)[];
}

export function runtimeCall(
  callee: Call["callee"],
  args: (Node | ConcreteValue)[],
  style: FunctionCallStyle = "regular",
  forceArity: number | undefined = undefined,
): Call {
  return {
    kind: "runtime_call",
    callee,
    forceArity,
    args,
    style,
  };
}
