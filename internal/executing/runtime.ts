import { Unimplemented, Unreachable } from "../../errors.ts";
import {
  FunctionCallStyle,
  Node,
  Node_FunctionCall,
  NodeValue_List,
} from "../parsing/building_blocks.ts";
import { builtinScope } from "./builtin_functions.ts";
import {
  ConcreteValue,
  concreteValue,
  EvaluatedValue,
  LazyValue,
  lazyValue,
} from "./evaluated_values.ts";
import { invokeAll } from "./helpers.ts";
import { RuntimeError } from "./runtime_errors.ts";

export interface RandomGenerator {
  int32(): number;
}

export interface RuntimeOptions {
  rng: RandomGenerator;
  // TODO: timeout
}

export class Runtime {
  root: Node;

  executed = false;

  rng: RandomGenerator;

  constructor(root: Node, opts: RuntimeOptions) {
    this.root = root;
    this.rng = opts.rng;
  }

  executeAndTranslate():
    | number
    | boolean
    | (number | boolean)[]
    | RuntimeError {
    const result = this.execute();

    switch (result.kind) {
      case "concrete":
        switch (typeof result.value) {
          case "number":
          case "boolean":
            return result.value;
          default:
            if (Array.isArray(result.value)) {
              return result.value.map((evaluatedValue) => {
                const v = evaluatedValue.value;
                if (typeof v === "number" || typeof v === "boolean") return v;
                throw new Unimplemented();
              });
            }
            throw new Unimplemented();
        }
        break;
      case "lazy":
        throw new Unreachable();
      case "error":
        return result.error;
    }
  }

  execute(): EvaluatedValue {
    if (this.executed) {
      throw new Unimplemented();
    }
    this.executed = true;
    const outermost = this.#eval(builtinScope, this.root);
    return invokeAll(outermost);
  }

  #eval(scope: Scope, node: Node): EvaluatedValue {
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
        // FIXME: 如果 `evaluatedArgs` 中存在错误，则应不 eval 其他部分直接返回。
        return this.#evalFunctionCall(scope, node);
      }
      case "closure_call":
        throw new Unimplemented();
      case "captured":
        throw new Unimplemented();
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
        if (
          call.forceArity !== undefined &&
          call.forceArity !== args.length
        ) {
          throw new Unimplemented();
        }

        const fn = scope[`${call.identifier}/${args.length}`];
        if (!fn) {
          throw new Unimplemented();
        } else if (typeof fn !== "function") {
          throw new Unimplemented();
        }
        const evalFn = (node: Node) => this.#eval(scope, node);
        const executed = fn(
          args,
          call.style,
          makeFunctionRuntime(scope, evalFn, this.rng),
        );
        return executed.result;
      },
      call.args,
      false,
    );
  }
}

export type Scope = { [ident: string]: Function | EvaluatedValue };

export type Function = (
  params: Node[],
  style: FunctionCallStyle,
  runtime: FunctionRuntime,
) => { result: EvaluatedValue };

export interface FunctionRuntime {
  evaluate: (node: Node) => EvaluatedValue;
  scope: Scope;
  random: RandomGenerator;
}

function makeFunctionRuntime(
  scope: Scope,
  evalFn: (node: Node) => EvaluatedValue,
  randomGenerator: RandomGenerator,
): FunctionRuntime {
  return {
    evaluate: evalFn,
    scope,
    random: randomGenerator,
  };
}
