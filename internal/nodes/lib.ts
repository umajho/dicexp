interface _Node {
  kind: string;
}

export type Node =
  | Node_RegularCall
  | Node_ValueCall
  | Node_Captured
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

export interface Node_Captured extends _Node {
  kind: "captured";

  identifier: string;

  forceArity: number;
}

export function captured(
  identifier: string,
  forceArity: number,
): Node_Captured {
  return {
    kind: "captured",
    identifier,
    forceArity,
  };
}

export interface Node_Value extends _Node {
  kind: "value";

  value: number | boolean | NodeValue_List | NodeValue_Closure;
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
}

export function closure(identifiers: string[], body: Node): Node_Value {
  return value({
    valueKind: "closure",
    parameterIdentifiers: identifiers,
    body,
  });
}
