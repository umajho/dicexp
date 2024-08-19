import { SyntaxNode, Tree } from "@lezer/common";

import {
  captured,
  closure,
  list,
  Node,
  regularCall,
  repetition,
  valueCall,
} from "@dicexp/nodes";
import { negateInteger, parseBoolean, parseInteger } from "./utils";
import { createParseError, ParseError, Range } from "./parse_error";
import { Unreachable } from "@dicexp/errors";

export class Transformer {
  constructor(
    private tree: Tree,
    private source: string,
  ) {}

  transform(): ["ok", Node] | ["error", ParseError] {
    {
      const result = this._ensureNoError(this.tree);
      if (result !== "ok") return result;
    }

    return this._transform(this.tree.topNode.firstChild!);
  }

  private _ensureNoError(tree: Tree): "ok" | ["error", ParseError] {
    const badRanges: Range[] = [];
    tree.iterate({
      enter(node) {
        if (node.name === "⚠") {
          badRanges.push({ from: node.from, to: node.to });
        }
      },
    });
    if (badRanges.length) {
      return [
        "error",
        createParseError.generalGrammar(this.source, badRanges),
      ];
    } else {
      return "ok";
    }
  }

  private _transform(node: SyntaxNode): ["ok", Node] | ["error", ParseError] {
    const children = Transformer._getChildren(node);

    switch (node.type.name) {
      case "BinaryExpression": {
        let op = this._getRaw(children[1]!);

        const leftResult = this._transform(children[0]!);
        if (leftResult[0] === "error") return leftResult;
        const left = leftResult[1];

        if (op === ".") {
          const argListResult = this._getArgumentListItems(children[2]!);
          if (argListResult[0] === "error") return argListResult;
          const argList = argListResult[1];

          return ["ok", valueCall("function", left, argList)];
        }

        const rightResult = this._transform(children[2]!);
        if (rightResult[0] === "error") return rightResult;
        let right = rightResult[1];

        if (op === "#") {
          let bodyRaw = this.source.slice(children[2]!.from, children[2]!.to);
          bodyRaw = bodyRaw.trim();
          if (bodyRaw.startsWith("(") && bodyRaw.endsWith(")")) {
            bodyRaw = bodyRaw.slice(1, bodyRaw.length - 1);
          }
          return ["ok", repetition(left, right, bodyRaw)];
        } else if (op === "|>") {
          return this._transformPipeExpression(left, right);
        } else if (["d" /*, "d%"*/].indexOf(op) >= 0) {
          right = Transformer._handleAfterDiceRoll(right);
        }
        return ["ok", regularCall("operator", op, [left, right])];
      }
      case "UnaryExpression": {
        const op = this._getRaw(children[0]!);

        const rightResult = this._transform(children[1]!);
        if (rightResult[0] === "error") return rightResult;
        let right = rightResult[1];

        if (["d" /*, "d%"*/].indexOf(op) >= 0) {
          right = Transformer._handleAfterDiceRoll(right);
        }
        return ["ok", regularCall("operator", op, [right])];
      }
      case "Grouping": {
        return this._transform(children[1]!);
      }
      case "RegularCall": {
        const name = this._getRaw(children[0]!);
        const argPart = children[1]!;
        let argList: Node[];
        if (argPart.name === "ArgumentList") {
          const argListResult = this._getArgumentListItems(argPart);
          if (argListResult[0] === "error") return argListResult;
          argList = argListResult[1];
        } else { // Closure
          // 由于与管道运算符之间的交互（优先级）存在问题，目前此分支对应语法暂
          // 时被移除了，未来可能会恢复。
          throw new Unreachable();
          // const argResult = this._transform(argPart);
          // if (argResult[0] === "error") return argResult;
          // argList = [argResult[1]];
        }
        return ["ok", regularCall("function", name, argList)];
      }
      case "List": {
        const itemsResult = //
          this._getItems(Transformer._getChildren(children[1]!));
        if (itemsResult[0] === "error") return itemsResult;
        const items = itemsResult[1];

        return ["ok", list(items)];
      }
      case "Closure": {
        const paramList = Transformer._getChildren(children[0]!);
        const identifiers = paramList.map((p) => this._getRaw(p));

        const bodyResult = this._transform(children[1]!);
        if (bodyResult[0] === "error") return bodyResult;
        const body = bodyResult[1];

        const raw = this.source.slice(node.from, node.to);
        return ["ok", closure(identifiers, body, raw)];
      }
      case "Capture": {
        let identifier = this._getRaw(children[0]!);
        const arityResult = parseInteger(this._getRaw(children[1]!));
        if (arityResult[0] === "error") return arityResult;
        const arity = arityResult[1].value as number;
        return ["ok", captured(identifier, arity)];
      }
      case "Variable": {
        return ["ok", this._getRaw(node)];
      }
      case "LiteralInteger":
        const result = parseInteger(this._getRaw(node));
        if (result[0] === "error") return result;
        return ["ok", result[1]];
      case "LiteralBoolean":
        return ["ok", parseBoolean(this._getRaw(node))];
      default:
        throw new Error(`TODO: ${node.name}`);
    }
  }

  private _getRaw(node: SyntaxNode): string {
    return this.source.slice(node.from, node.to);
  }

  private static _getChildren(node: SyntaxNode): SyntaxNode[] {
    const children: SyntaxNode[] = [];
    for (let c = node.firstChild; c !== null; c = c.nextSibling) {
      children.push(c);
    }
    return children;
  }

  private _getArgumentListItems(
    argList: SyntaxNode,
  ): ["ok", Node[]] | ["error", ParseError] {
    const argListNode = Transformer._getChildren(argList);
    return this._getItems(Transformer._getChildren(argListNode[1]!));
  }

  private _getItems(
    children: SyntaxNode[],
  ): ["ok", Node[]] | ["error", ParseError] {
    const out: Node[] = [];
    for (const c of children) {
      const result = this._transform(c.firstChild!);
      if (result[0] === "error") return result;
      out.push(result[1]);
    }
    return ["ok", out];
  }

  private _transformPipeExpression(
    left: Node,
    right: Node,
  ): ["ok", Node] | ["error", ParseError] {
    if (typeof right === "string") {
      return ["ok", regularCall("piped", right, [left])];
    } else if (right.kind === "regular_call" && right.style === "function") {
      return ["ok", regularCall("piped", right.name, [left, ...right.args])];
    } else if (right.kind === "value_call" && right.style === "function") {
      return ["ok", valueCall("piped", right.variable, [left, ...right.args])];
    }

    return ["error", createParseError.badPipeTarget()];
  }

  private static _handleAfterDiceRoll(right: Node): Node {
    if (
      typeof right !== "string" && right.kind === "regular_call" &&
      right.args.length === 1
    ) {
      const arg = right.args[0]!;
      if (right.name === "+") {
        return arg;
      } else if (
        right.name === "-" && typeof arg !== "string" &&
        arg.kind === "value" && typeof arg.value === "number"
      ) {
        return negateInteger(arg);
      }
    }

    return right;
  }
}
