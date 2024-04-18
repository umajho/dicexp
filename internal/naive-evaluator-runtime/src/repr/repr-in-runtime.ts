export type ReprInRuntime =
  | [type: /** lazy */ "@", fn: () => ReprInRuntime]
  | [type: /** raw */ "r", raw: string]
  | [type: /** unevaluated */ "_"]
  | [type: /** value_primitive */ "vp", value: number | boolean]
  | [
    /** type 中有后缀 `@` 代表是运行时版本，下同 */
    type: /** value_list */ "vl@",
    items: () => ReprInRuntime[],
    containsError: () => boolean,
    surplusItems?: () => ReprInRuntime[] | undefined,
  ]
  | [
    type: /** value_sum */ "vs@",
    sum: () => number,
    addends: () => ReprInRuntime[],
    surplusAddends: () => ReprInRuntime[] | undefined,
  ]
  | [
    type: /** identifier */ "i",
    name: string,
    value: ReprInRuntime | undefined,
  ]
  | [
    type: /** call_regular */ "cr@",
    style: "f" | "o" | "p", /** function | operator | piped */
    callee: string,
    args: (() => ReprInRuntime)[] | undefined,
    result: ReprInRuntime | undefined,
  ]
  | [
    type: /** call_value */ "cv@",
    style: "f" | "p", /** function | piped */
    callee: ReprInRuntime,
    args: (() => ReprInRuntime)[] | undefined,
    result: ReprInRuntime | undefined,
  ]
  | [type: /** capture */ "&", name: string, arity: number]
  | [
    type: /** repetition */ "#",
    count: ReprInRuntime,
    body: string,
    result: ReprInRuntime | undefined,
  ]
  | [
    type: /** error */ "e",
    errorMessage: string,
    source: ReprInRuntime | undefined,
  ]
  | [type: /** error_indirect */ "E"]
  | [
    type: /** decoration */ "d",
    decoration_type: "🗑️" | "🔄" | "⚡️" | "✨",
    inner: ReprInRuntime,
  ];
