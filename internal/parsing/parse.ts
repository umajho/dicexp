import ohm from "https://unpkg.com/ohm-js@16/dist/ohm.esm.js";
import { Unreachable } from "../../errors.ts";
import { ActionDictForTransformationBuilder } from "./action_dict_builder.ts";

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
import { convertTextToHalfWidth } from "./fullwidth_convertion.ts";

import grammarRaw from "./grammar.json" assert { type: "json" };
import { simpleParse } from "./parse_simple.ts";

export const grammar = ohm.grammar(grammarRaw);

export const semantics = grammar.createSemantics();

export interface ParseOptions {
  optimizesForSimpleCases?: boolean;
}

export function parse(code: string, opts?: ParseOptions): Node {
  code = convertTextToHalfWidth(code);

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

const actionDict = (new ActionDictForTransformationBuilder()).addOperators({
  "-4": [
    { op: "||", opText: "or", types: "binary" },
  ],
  "-3": [
    { op: "&&", opText: "and", types: "binary" },
  ],
  "-2": [
    { op: "==", opText: "eq", types: "binary" },
    { op: "!=", opText: "not_eq", types: "binary" },
  ],
  "-1": [
    { op: "<", opText: "lt", types: "binary" },
    { op: ">", opText: "gt", types: "binary" },
    { op: "<=", opText: "lte", types: "binary" },
    { op: ">=", opText: "gte", types: "binary" },
  ],
  0: [
    { op: "|>", opText: "pipe", types: "binary" },
  ],
  0.1: [
    { op: "#", opText: "repeat", types: "binary" },
  ],
  1: [
    { op: "~", opText: "range", types: ["binary", "prefix"] },
  ],
  2: [
    { op: "+", opText: "add", types: "binary" },
    { op: "-", opText: "sub", types: "binary" },
    { op: "+", opText: "noop", types: "prefix" },
    { op: "-", opText: "negate", types: "prefix" },
  ],
  3: [
    { op: "*", opText: "mul", types: "binary" },
    { op: "//", opText: "div_int", types: "binary" },
    { op: "%", opText: "mod_non_negative_int", types: "binary" },
  ],
  5: [
    { op: "d", opText: "roll", types: ["binary", "prefix"] },
    { op: "d%", opText: "roll_dao", types: ["binary", "prefix"] },
  ],
  6: [
    { op: "^", opText: "exponent", types: "binary" },
  ],
  10: [
    { op: "~", opText: "range", types: "prefix" },
    { op: "+", opText: "noop", types: "prefix" },
    { op: "-", opText: "negate", types: "prefix" },
    { op: "d", opText: "roll", types: "prefix" },
    { op: "d%", opText: "roll_dao", types: "prefix" },

    { op: "!", opText: "not", types: "prefix" },
  ],
})
  .add("RollGrouping_grouping", (_lp, exp, _rp) => exp.transform())
  .add("GroupingExp_grouping", (_lp, exp, _rp) => exp.transform())
  .addWithInlines("FunctionCallExp", {
    "regular": (ident, args) =>
      functionCall(ident.transform(), args.transform(), "regular"),
    "with_closure_argument": (ident, closure) =>
      functionCall(ident.transform(), [closure.transform()], "regular"),
    "closure": (closure, args) =>
      closureCall(closure.transform(), args.transform()),
    "operator": (operator, args) => {
      const nodeOp = operator.transform() as Node_Captured;
      return functionCall(
        nodeOp.identifier,
        args.transform(),
        "regular",
        nodeOp.forceArity,
      );
    },
  })
  .add(
    "asFunctionExp",
    (_amp, ident_terminal, _slash, arity) =>
      captured(ident_terminal.sourceString, Number(arity.sourceString)),
  )
  .add("ArgumentList", (_lp, exps, _rp) => evalList(exps))
  .add("ListExp", (_lp, exps, _rp) => list(evalList(exps)))
  .add(
    "ClosureExp",
    (_back_slash_and_lp, identifiers, _arrow, body, _rp) =>
      closure(evalList(identifiers), body.transform()),
  )
  .addForSourceString("ident", [1, 2], (s) => s)
  .addForSourceString("literalInteger", [1, 2], (s) => parseInteger(s))
  .addForSourceString("literalBoolean", [1], (s) => parseBoolean(s))
  .build();

semantics.addOperation("transform", {
  ...actionDict,
  // 留下一片地方用于实验规则
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

export function parseBoolean(sourceString: string) {
  switch (sourceString) {
    case "true":
      return value(true);
    case "false":
      return value(false);
    default:
      throw new Unreachable();
  }
}
