export type Repr =
  | [type: /** raw */ "r", raw: string]
  | [type: /** unevaluated */ "_"]
  | [type: /** value_primitive */ "vp", value: number | boolean]
  | [
    type: /** value_list */ "vl",
    items: Repr[],
    containsError: boolean,
    surplusItems?: Repr[],
  ]
  | [
    type: /** value_sum */ "vs",
    sum: number,
    addends: Repr[],
    surplusAddends?: Repr[],
  ]
  | [
    type: /** identifier */ "i",
    name: string,
    value: Repr | undefined,
  ]
  | [
    type: /** call_regular */ "cr",
    style: "f" | "o" | "p", /** function | operator | piped */
    callee: string,
    args: Repr[] | undefined,
    result: Repr | undefined,
  ]
  | [
    type: /** call_value */ "cv",
    style: "f" | "p", /** function | piped */
    callee: Repr,
    args: Repr[] | undefined,
    result: Repr | undefined,
  ]
  | [
    type: /** calls_of_operators_with_same_precedence */ "c$",
    head: Repr,
    tail: [string, Repr][],
    result: Repr | undefined,
  ]
  | [type: /** capture */ "&", name: string, arity: number]
  | [
    type: /** repetition */ "#",
    count: Repr,
    body: string,
    result: Repr | undefined,
  ]
  | [
    type: /** error */ "e",
    errorMessage: string,
    source: Repr | undefined,
  ]
  | [type: /** error_indirect */ "E"]
  | [
    type: /** decoration */ "d",
    decoration_type: "🗑️" | "🔄" | "⚡️" | "✨",
    inner: Repr,
  ];
