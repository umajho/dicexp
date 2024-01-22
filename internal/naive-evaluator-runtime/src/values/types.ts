import { ValueBox } from "../value-boxes/mod";
import { ErrorBeacon } from "../internal/error-beacon";
import { ReprInRuntime } from "../repr/mod";

export type Value =
  | Value_Direct
  | Value_Container;
/**
 * 没有更内部内容的值。
 * 用这样的值创建 ValueBox 时不用检查内部是否存在错误。
 */
export type Value_Direct =
  | number
  | boolean
  | Value_Callable;
export type Value_Container =
  | Value_List
  | Value_Sequence
  | Value_Sequence$Sum;
export type Value_Plain = Exclude<Value, Value_Sequence | Value_Sequence$Sum>;

export interface Value_Callable {
  type: "callable";
  arity: number;
  _call: (args: ValueBox[]) => ValueBox;

  representation: ReprInRuntime;
}

export type Value_List = ValueBox[] & {
  type: "list";
  errorBeacon: ErrorBeacon;
};

export interface Value_SequenceBase<
  Type extends string,
  Item,
  CastingImplicitlyTo extends Value_Plain,
> {
  type: Type;

  errorBeacon?: ErrorBeacon;

  at: (index: number) => Item | null;

  atWithStatus: (
    index: number,
  ) => ["ok" | "last" | "last_nominal", Item] | null;

  /**
   * 隐式转换成其他类型的值。
   */
  castImplicitly(): CastingImplicitlyTo;

  /**
   * 可用的名义上的长度。
   *
   * 当序列尚未到达名义上的界限时，这个值是实际长度，否则这个值是名义长度。
   */
  get availableNominalLength(): number;

  get nominalFragments(): SequenceFragment<Item>[];
  get surplusFragments(): SequenceFragment<Item>[] | null;
  /**
   * 所有产生了的片段，用于生成步骤展现。
   */
  get actualFragments(): SequenceFragment<Item>[];
}

export type SequenceFragment<T> = [
  /**
   * 留下的元素。
   */
  kept: [type: "regular" | Extract<ReprInRuntime, { 0: "d" }>[1], item: T],
  /**
   * 在上一个留下的元素与这次留下的元素之间的被遗弃（如在 reroll、filter 时）的元素。
   */
  abandonedBefore?: T[],
];

/**
 * 可以隐式转换为列表的序列。
 */
export type Value_Sequence = Value_SequenceBase<
  "sequence",
  ValueBox,
  Value_List
>;
/**
 * 可以隐式求和为整数的序列。
 */
export type Value_Sequence$Sum = Value_SequenceBase<
  "sequence$sum",
  number,
  number
>;
