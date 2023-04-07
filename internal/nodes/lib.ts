interface _Node {
  kind: string;
}

export type Node =
  | Node_RegularCall
  | Node_ValueCall
  | Node_Repetition
  | Node_Value
  | string; // 标识符

export type RegularCallStyle = "function" | "operator" | "piped";

/**
 * 一般的函数调用和运算符都算在内
 */
export interface Node_RegularCall extends _Node {
  kind: "regular_call";
  style: RegularCallStyle;

  name: string;

  args: Node[];
}

export function regularCall(
  style: RegularCallStyle,
  name: string,
  args: Node[],
): Node_RegularCall {
  return { kind: "regular_call", style, name, args };
}

export type ValueCallStyle = "function" | "piped";

export interface Node_ValueCall extends _Node {
  kind: "value_call";
  style: ValueCallStyle;

  variable: Node;

  args: Node[];
}

export function valueCall(
  style: ValueCallStyle,
  variable: Node,
  args: Node[],
): Node_ValueCall {
  return { kind: "value_call", style, variable, args };
}

export interface Node_Repetition extends _Node {
  kind: "repetition";

  count: Node;

  body: Node;
  bodyRaw: string;
}

export function repetition(
  count: Node,
  body: Node,
  bodyRaw: string,
): Node_Repetition {
  return {
    kind: "repetition",
    count,
    body,
    bodyRaw,
  };
}

export interface Node_Value extends _Node {
  kind: "value";

  value:
    | number
    | boolean
    | NodeValue_List
    | NodeValue_Closure
    | NodeValue_Captured;
}

export function value(value: Node_Value["value"]): Node_Value {
  return {
    kind: "value",
    value,
  };
}

interface _NodeValue {
  valueKind: string;
}

export interface NodeValue_List extends _NodeValue {
  valueKind: "list";

  member: Node[];
}

export function list(member: Node[]): Node_Value {
  return value({
    valueKind: "list",
    member,
  });
}

export interface NodeValue_Closure extends _NodeValue {
  valueKind: "closure";

  parameterIdentifiers: string[];

  body: Node;

  raw: string;
}

export function closure(
  identifiers: string[],
  body: Node,
  raw: string,
): Node_Value {
  return value({
    valueKind: "closure",
    parameterIdentifiers: identifiers,
    body,
    raw,
  });
}

export interface NodeValue_Captured extends _NodeValue {
  valueKind: "captured";

  identifier: string;

  forceArity: number;
}

export function captured(
  identifier: string,
  forceArity: number,
): Node_Value {
  return value({
    valueKind: "captured",
    identifier,
    forceArity,
  });
}
