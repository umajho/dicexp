type ReprBase<IsInRuntime extends boolean> =
  | (IsInRuntime extends true
    ? [type: /** lazy */ "@", fn: () => ReprBase<true>]
    : never)
  | [type: /** raw */ "r", raw: string]
  | [type: /** unevaluated */ "_"]
  | [type: /** value_primitive */ "vp", value: number | boolean]
  | (IsInRuntime extends true /** type 中有后缀 `@` 代表是运行时版本，下同 */
    ? [
      type: "vl@",
      items: () => ReprBase<true>[],
      containsError: () => boolean,
      surplusItems?: () => ReprBase<true>[] | undefined,
    ]
    : [
      type: /** value_list */ "vl",
      items: ReprBase<false>[],
      containsError: boolean,
      surplusItems?: ReprBase<false>[],
    ])
  | (IsInRuntime extends true ? [
      type: /** value_sum */ "vs@",
      sum: () => number,
      addends: () => ReprBase<true>[],
      surplusAddends: () => ReprBase<true>[] | undefined,
    ]
    : [
      type: /** value_sum */ "vs",
      sum: number,
      addends: ReprBase<false>[],
      surplusAddends?: ReprBase<false>[],
    ])
  | [
    type: "i", /** identifier */
    name: string,
    value: ReprBase<IsInRuntime> | undefined,
  ]
  | [
    type: IsInRuntime extends true ? "cr@" : "cr", /** call_regular */
    style: "f" | "o" | "p", /** function | operator | piped */
    callee: string,
    args:
      | (IsInRuntime extends true //
        ? (() => ReprBase<true>)[]
        : ReprBase<false>[])
      | undefined,
    result: ReprBase<IsInRuntime> | undefined,
  ]
  | [
    type: IsInRuntime extends true ? "cv@" : "cv", /** call_value */
    style: "f" | "p", /** function | piped */
    callee: ReprBase<IsInRuntime>,
    args:
      | (IsInRuntime extends true //
        ? (() => ReprBase<true>)[]
        : ReprBase<false>[])
      | undefined,
    result: ReprBase<IsInRuntime> | undefined,
  ]
  | (IsInRuntime extends true ? never : [
    type: "c$", /** calls_of_operators_with_same_precedence */
    head: ReprBase<false>,
    tail: [string, ReprBase<false>][],
    result: ReprBase<false> | undefined,
  ])
  | [type: /** capture */ "&", name: string, arity: number]
  | [
    type: /** repetition */ "#",
    count: ReprBase<IsInRuntime>,
    body: string,
    result: ReprBase<IsInRuntime> | undefined,
  ]
  | [
    type: "e", /** error */
    errorMessage: string,
    source: ReprBase<IsInRuntime> | undefined,
  ]
  | [type: /** error_indirect */ "E"]
  | [
    type: /** decoration */ "d",
    decoration_type: "🗑️" | "🔄" | "⚡️" | "✨",
    inner: ReprBase<IsInRuntime>,
  ];

export type Repr = ReprBase<false>;
export type ReprInRuntime = ReprBase<true>;
