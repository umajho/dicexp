import { NodePropSource } from "@lezer/common";
import { styleTags, tags as t } from "@lezer/highlight";

export const dicexpHighlight: NodePropSource = styleTags({
  BinaryOperator: t.operator,
  UnaryOperator: t.operator,

  Variable: t.variableName,
  "RegularCall/FunctionName": t.function(t.name),
  "Capture/Identifier": t.function(t.name),

  LiteralInteger: t.integer,
  LiteralBoolean: t.bool,

  "OpenParen CloseParen": t.paren,
  "OpenSBracket CloseSBracket": t.squareBracket,
  "Closure/OpenParen": t.brace,
  "Closure/CloseParen": t.brace,
  //

  // TODO:
  // `|…|…`, `&…/…`
  // , .
});
