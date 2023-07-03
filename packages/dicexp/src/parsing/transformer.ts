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
import {
  ParsingError_BadPipeTarget,
  ParsingError_General,
  Range,
} from "./parsing_error";

export class Transformer {
  constructor(
    private tree: Tree,
    private source: string,
  ) {}

  transform(): Node {
    this.ensureNoError(this.tree);
    return this._transform(this.tree.topNode.firstChild!);
  }

  private ensureNoError(tree: Tree) {
    const badRanges: Range[] = [];
    tree.iterate({
      enter(node) {
        if (node.name === "⚠") {
          badRanges.push({ from: node.from, to: node.to });
        }
      },
    });
    if (badRanges.length) {
      throw new ParsingError_General(this.source, badRanges);
    }
  }

  private _transform(node: SyntaxNode): Node {
    const children = Transformer.getChildren(node);

    switch (node.type.name) {
      case "BinaryExpression": {
        const op = this.getRaw(children[1]);
        const left = this._transform(children[0]);
        if (op === ".") {
          const argList = this.getArgumentListItems(children[2]);
          return valueCall("function", left, argList);
        }
        let right = this._transform(children[2]);
        if (op === "#") {
          let bodyRaw = this.source.slice(children[2].from, children[2].to);
          bodyRaw = bodyRaw.trim();
          if (bodyRaw.startsWith("(") && bodyRaw.endsWith(")")) {
            bodyRaw = bodyRaw.slice(1, bodyRaw.length - 1);
          }
          return repetition(left, right, bodyRaw);
        } else if (op === "|>") {
          return this.transformPipeExpression(left, right);
        } else if (["d" /*, "d%"*/].indexOf(op) >= 0) {
          right = Transformer.handleAfterDiceRoll(right);
        }
        return regularCall("operator", op, [left, right]);
      }
      case "UnaryExpression": {
        const op = this.getRaw(children[0]);
        let right = this._transform(children[1]);
        if (["d" /*, "d%"*/].indexOf(op) >= 0) {
          right = Transformer.handleAfterDiceRoll(right);
        }
        return regularCall("operator", op, [right]);
      }
      case "Grouping": {
        return this._transform(children[1]);
      }
      case "RegularCall": {
        const name = this.getRaw(children[0]);
        const argPart = children[1];
        let argList: Node[];
        if (argPart.name === "ArgumentList") {
          argList = this.getArgumentListItems(argPart);
        } else { // Closure
          argList = [this._transform(argPart)];
        }
        return regularCall("function", name, argList);
      }
      case "List": {
        const items = this.getItems(Transformer.getChildren(children[1]));
        return list(items);
      }
      case "Closure": {
        const paramList = Transformer.getChildren(children[1]);
        const identifiers = paramList.map((p) => this.getRaw(p));
        const body = this._transform(children[2]);
        const raw = this.source.slice(node.from, node.to);
        return closure(identifiers, body, raw);
      }
      case "Capture": {
        const identifier = this.getRaw(children[0]);
        const arity = parseInteger(this.getRaw(children[1])).value as number;
        return captured(identifier, arity);
      }
      case "Variable": {
        return this.getRaw(node);
      }
      case "LiteralInteger":
        return parseInteger(this.getRaw(node));
      case "LiteralBoolean":
        return parseBoolean(this.getRaw(node));
      default:
        throw new Error(`TODO: ${node.name}`);
    }
  }

  private getRaw(node: SyntaxNode): string {
    return this.source.slice(node.from, node.to);
  }

  private static getChildren(node: SyntaxNode): SyntaxNode[] {
    const children: SyntaxNode[] = [];
    for (let c = node.firstChild; c !== null; c = c.nextSibling) {
      children.push(c);
    }
    return children;
  }

  private getArgumentListItems(argList: SyntaxNode): Node[] {
    const argListNode = Transformer.getChildren(argList);
    return this.getItems(Transformer.getChildren(argListNode[1]));
  }

  private getItems(children: SyntaxNode[]): Node[] {
    return children.map((c) => this._transform(c.firstChild!));
  }

  private transformPipeExpression(left: Node, right: Node): Node {
    if (typeof right === "string") {
      return regularCall("piped", right, [left]);
    } else if (right.kind === "regular_call" && right.style === "function") {
      return regularCall("piped", right.name, [left, ...right.args]);
    } else if (right.kind === "value_call" && right.style === "function") {
      return valueCall("piped", right.variable, [left, ...right.args]);
    }

    throw new ParsingError_BadPipeTarget();
  }

  private static handleAfterDiceRoll(right: Node): Node {
    if (
      typeof right !== "string" && right.kind === "regular_call" &&
      right.args.length === 1
    ) {
      const arg = right.args[0];
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
