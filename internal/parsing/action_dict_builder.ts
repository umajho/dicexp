import ohm from "https://unpkg.com/ohm-js@16/dist/ohm.esm.js";
import { Unreachable } from "../../errors.ts";

import { call, calleeFunction, Node } from "./building_blocks.ts";

type OperatorType = "binary" | "prefix";

interface OperatorTables {
  [precedence: number]: OperatorRow[];
}

interface OperatorRow {
  op: string;
  opText: string;
  types: OperatorType | OperatorType[];
}

// FIXME: 去掉 any
// deno-lint-ignore no-explicit-any
type ActionResultForTransformation = Node | any;
export class ActionDictForTransformationBuilder {
  #dict: ohm.ActionDict<ActionResultForTransformation> = {};

  #built = false;
  get built() {
    return this.#built;
  }

  build() {
    if (this.#built) throw new Unreachable();
    this.#built = true;
    return this.#dict;
  }

  add(rule: string, action: ohm.Action<ActionResultForTransformation>) {
    this.#ensureRuleNameUnique(rule);
    this.#dict[rule] = action;

    return this;
  }

  addForSourceString(
    rule: string,
    arityIndicator: { length: number },
    transformer: (sourceString: string) => ActionResultForTransformation,
  ) {
    this.#ensureRuleNameUnique(rule);
    const arity = arityIndicator.length;

    const action = function () {
      return transformer(this.sourceString);
    } as ohm.Action<ActionResultForTransformation>;
    const actionProxy = new Proxy(action, {
      get: function (target, property) {
        if (property === "length") return arity;
        // deno-lint-ignore ban-ts-comment
        // @ts-ignore
        return target[property];
      },
    });

    this.#dict[rule] = actionProxy;

    return this;
  }

  addOperators(tables: OperatorTables) {
    for (const [precedenceStr, table] of Object.entries(tables)) {
      for (const row of table) {
        const precedence = Number(precedenceStr);
        this.#addOperator(precedence, row);
      }
    }

    return this;
  }

  #addOperator(precedence: number, row: OperatorRow) {
    const types = Array.isArray(row.types) ? row.types : [row.types];
    for (const t of types) {
      switch (t) {
        case "binary":
          this.addBinaryOperator(precedence, row.opText, row.op);
          break;
        case "prefix":
          this.addPrefixOperator(precedence, row.opText, row.op);
          break;
        default:
          throw new Unreachable(`未知的运算符类型 ${t}。`);
      }
    }

    return this;
  }

  addBinaryOperator(precedence: number, opText: string, op: string) {
    const precedenceText = this.#renderPrecedence(precedence);
    const rule = `BinOpExpP${precedenceText}_${opText}`;
    this.#ensureRuleNameUnique(rule);

    this.#dict[rule] = (left, _op, right) => {
      const args = [left.transform(), right.transform()];
      return call(calleeFunction(op), args, "operator");
    };

    return this;
  }

  addPrefixOperator(precedence: number, opText: string, op: string) {
    const precedenceText = this.#renderPrecedence(precedence);
    const rule = `UnOpExpP${precedenceText}_${opText}`;
    this.#ensureRuleNameUnique(rule);

    this.#dict[rule] = (_op, right) => {
      const args = [right.transform()];
      return call(calleeFunction(op), args, "operator");
    };

    return this;
  }

  #renderPrecedence(precedence: number) {
    return `${precedence}`.replace("-", "n").replace(".", "p");
  }

  addWithInlines(
    rule: string,
    inlines: { [name: string]: ohm.Action<ActionResultForTransformation> },
  ) {
    for (const [name, action] of Object.entries(inlines)) {
      const fullRule = `${rule}_${name}`;
      this.#ensureRuleNameUnique(fullRule);
      this.#dict[fullRule] = action;
    }

    return this;
  }

  #ensureRuleNameUnique(ruleName: string) {
    if (this.#dict[ruleName]) throw new Error(`duplicated rule: ${ruleName}`);
  }
}
