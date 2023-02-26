import { Unimplemented, Unreachable } from "../../errors.ts";
import { FunctionCallStyle, Node } from "../parsing/building_blocks.ts";
import { builtinScope } from "./builtin_functions.ts";
import { EvaluatedValue, evaluatedValue } from "./evaluated_values.ts";
import { invokeAll } from "./helpers.ts";

export interface RuntimeOptions {
  random: { bigIntArray: (size: number) => BigInt[] };
  // TODO: timeout
}

export class Runtime {
  root: Node;

  executed = false;

  constructor(root: Node, opts: RuntimeOptions) {
    this.root = root;
  }

  executeAndTranslate(): number | boolean | (number | boolean)[] {
    const result = this.execute();

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
          return evaluatedValue(node.value, [`${node.value}`]);
        }
        switch (node.value.valueKind) {
          case "list": {
            const listEvaluated = node.value.member.map((node) =>
              this.#eval(scope, node)
            );
            return evaluatedValue(listEvaluated, ["TODO: step for list"]);
          }
          case "closure":
            throw new Unimplemented();
          default:
            throw new Unreachable();
        }
      }
      case "function_call": {
        // FIXME: 如果 `evaluatedArgs` 中存在错误，则应不 eval 其他部分直接返回。
        return evaluatedValue({
          valueKind: "lazy",
          invoke: (args) => {
            if (
              node.forceArity !== undefined &&
              node.forceArity !== args.length
            ) {
              throw new Unimplemented();
            }

            const fn = scope[`${node.identifier}/${args.length}`];
            if (!fn) {
              throw new Unimplemented();
            } else if (typeof fn !== "function") {
              throw new Unimplemented();
            }
            const executed = fn(
              (node) => this.#eval(scope, node),
              args,
              node.style,
            );
            return executed.result;
          },
          args: node.args,
        }, ["FIXME: lazy 的 step 在执行后才会有。"]);
      }
      case "closure_call":
        throw new Unimplemented();
      case "captured":
        throw new Unimplemented();
      default:
        throw new Unreachable();
    }
  }
}

export type Scope = { [ident: string]: Function | EvaluatedValue };

export type Function = (
  evalFn: (node: Node) => EvaluatedValue,
  params: Node[],
  style: FunctionCallStyle,
) => { result: EvaluatedValue };
