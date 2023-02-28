interface _Node {
  kind: string;
}

export type Node =
  | Node_FunctionCall
  | Node_ClosureCall
  | Node_Captured
  | Node_Value
  | string; // 标识符

export type FunctionCallStyle =
  | "regular"
  | "piped"
  | "operator"
  | "as-parameter";

export interface Node_FunctionCall extends _Node {
  kind: "function_call";

  identifier: string;

  /**
   * - regular: `foo(bar)`
   * - piped: `bar |> foo()`
   * - operator `-bar` / `bar + baz`
   */
  style: FunctionCallStyle;

  forceArity: number | undefined;
  args: Node[];
}

export function functionCall(
  identifier: string,
  args: Node[],
  style: FunctionCallStyle = "regular",
  forceArity: number | undefined = undefined,
): Node_FunctionCall {
  return {
    kind: "function_call",
    identifier,
    forceArity,
    args,
    style,
  };
}

export interface Node_ClosureCall extends _Node {
  kind: "closure_call";

  closure: NodeValue_Closure;

  args: Node[];
}

export function closureCall(
  closure: NodeValue_Closure,
  args: Node[],
): Node_ClosureCall {
  return {
    kind: "closure_call",
    closure,
    args,
  };
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
