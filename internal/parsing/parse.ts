import ohm from "https://unpkg.com/ohm-js@16/dist/ohm.esm.js";
import { Unreachable } from "../../errors.ts";

import {
  captured,
  closure,
  closureCall,
  functionCall,
  list,
  Node,
  Node_Captured,
  value,
} from "./building_blocks.ts";

import grammarRaw from "./grammar.json" assert { type: "json" };
import { simpleParse } from "./parse_simple.ts";

export const grammar = ohm.grammar(grammarRaw);

export const semantics = grammar.createSemantics();

export interface ParseOptions {
  optimizesForSimpleCases?: boolean;
}

export function parse(code: string, opts?: ParseOptions): Node {
  if (opts?.optimizesForSimpleCases ?? true) {
    const result = simpleParse(code);
    if (result) return result;
  }

  const parsed = grammar.match(code);
  if (parsed.failed()) {
    throw `(TODO: error) ${parsed.message}`;
  }
  return semantics(parsed).transform() as Node;
}

semantics.addOperation("transform", {
  Exp(exp) {
    return exp.transform();
  },

  BinOpExpPn4_or(left, _op, right) {
    return transformBinaryOperator("||", left, right);
  },
  BinOpExpPn3_and(left, _op, right) {
    return transformBinaryOperator("&&", left, right);
  },
  BinOpExpPn2_eq(left, _op, right) {
    return transformBinaryOperator("==", left, right);
  },
  BinOpExpPn2_not_eq(left, _op, right) {
    return transformBinaryOperator("!=", left, right);
  },
  BinOpExpPn1_lt(left, _op, right) {
    return transformBinaryOperator("<", left, right);
  },
  BinOpExpPn1_gt(left, _op, right) {
    return transformBinaryOperator(">", left, right);
  },
  BinOpExpPn1_lte(left, _op, right) {
    return transformBinaryOperator("<=", left, right);
  },
  BinOpExpPn1_gte(left, _op, right) {
    return transformBinaryOperator(">=", left, right);
  },
  BinOpExpP0_pipe(left, _op, right) {
    return transformBinaryOperator("|>", left, right);
  },
  BinOpExpP0p1_repeat(left, _op, right) {
    return transformBinaryOperator("#", left, right);
  },
  BinOpExpP1_range(left, _op, right) {
    return transformBinaryOperator("~", left, right);
  },
  UnOpExpP1_range_short(_op, right) {
    return functionCall("~", [right.transform()], "operator");
  },
  BinOpExpP2_add(left, _op, right) {
    return transformBinaryOperator("+", left, right);
  },
  BinOpExpP2_sub(left, _op, right) {
    return transformBinaryOperator("-", left, right);
  },
  UnOpExpP2_noop(_op, right) {
    return functionCall("+", [right.transform()], "operator");
  },
  UnOpExpP2_negate(_op, right) {
    return functionCall("-", [right.transform()], "operator");
  },
  BinOpExpP3_mul(left, _op, right) {
    return transformBinaryOperator("*", left, right);
  },
  BinOpExpP3_div_int(left, _op, right) {
    return transformBinaryOperator("//", left, right);
  },
  BinOpExpP3_mod_non_negative_int(left, _op, right) {
    return transformBinaryOperator("%", left, right);
  },
  // 暂无 P5
  BinOpExpP5_roll(left, _op, right) {
    return transformBinaryOperator("d", left, right);
  },
  BinOpExpP5_roll_dao(left, _op, right) {
    return transformBinaryOperator("d%", left, right);
  },
  UnOpExpP5_roll_short(_op, right) {
    return functionCall("d", [right.transform()], "operator");
  },
  UnOpExpP5_roll_dao_short(_op, right) {
    return functionCall("d%", [right.transform()], "operator");
  },
  BinOpExpP6_exponent(left, _op, right) {
    return transformBinaryOperator("^", left, right);
  },

  UnOpExpP10_range_short(_op, right) {
    return functionCall("~", [right.transform()], "operator");
  },
  UnOpExpP10_noop(_op, right) {
    return functionCall("+", [right.transform()], "operator");
  },
  UnOpExpP10_negate(_op, right) {
    return functionCall("-", [right.transform()], "operator");
  },
  UnOpExpP10_roll_short(_op, right) {
    return functionCall("d", [right.transform()], "operator");
  },
  UnOpExpP10_roll_dao_short(_op, right) {
    return functionCall("d%", [right.transform()], "operator");
  },
  UnOpExpP10_not(_op, right) {
    return functionCall("!", [right.transform()], "operator");
  },

  RollGrouping_grouping(_lp, exp, _rp) {
    return exp.transform();
  },
  GroupingExp_grouping(_lp, exp, _rp) {
    return exp.transform();
  },

  FunctionCallExp_regular(ident, args) {
    return functionCall(ident.transform(), args.transform(), "regular");
  },
  FunctionCallExp_with_closure_argument(ident, closure) {
    return functionCall(ident.transform(), [closure.transform()], "regular");
  },
  FunctionCallExp_closure(closure, args) {
    return closureCall(closure.transform(), args.transform());
  },
  FunctionCallExp_operator(operator, args) {
    const nodeOp = operator.transform() as Node_Captured;
    return functionCall(
      nodeOp.identifier,
      args.transform(),
      "regular",
      nodeOp.forceArity,
    );
  },

  asFunctionExp(_amp, ident_terminal, _slash, arity) {
    return captured(ident_terminal.sourceString, Number(arity.sourceString));
  },

  ArgumentList(_lp, exps, _rp) {
    return evalList(exps);
  },

  ListExp(_lp, exps, _rp) {
    return list(evalList(exps));
  },

  ClosureExp(_back_slash_and_lp, identifiers, _arrow, body, _rp) {
    return closure(evalList(identifiers), body.transform());
  },

  ident(_1, _2) {
    return this.sourceString;
  },

  literalInteger(_1, _2) {
    return parseInteger(this.sourceString);
  },

  literalBoolean(_) {
    switch (this.sourceString) {
      case "true":
        return value(true);
      case "false":
        return value(false);
      default:
        throw new Unreachable();
    }
  },
});

function evalList(exps: ohm.Node) {
  const iter = exps.asIteration();
  return iter.children.map((exp: ohm.Node) => exp.transform());
}

export function parseInteger(sourceString: string, replacesDash = true) {
  if (replacesDash) {
    sourceString = sourceString.replace("_", "");
  }
  const int = parseInt(sourceString);
  if (int < Number.MIN_SAFE_INTEGER) {
    // TODO: throw error
    return value(-Infinity);
  } else if (int > Number.MAX_SAFE_INTEGER) {
    // TODO: throw error
    return value(Infinity);
  }
  return value(int);
}

function transformBinaryOperator(op: string, left: ohm.Node, right: ohm.Node) {
  return functionCall(op, [left.transform(), right.transform()], "operator");
}
