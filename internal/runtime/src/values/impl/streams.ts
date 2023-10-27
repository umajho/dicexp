import {
  createValue,
  StreamFragment,
  Value_List,
  Value_Stream$List,
  Value_Stream$Sum,
  ValueBox,
} from "../mod";

export function createStream$list(
  yielder: () => Yielded<ValueBox> | null,
  opts?: { initialNominalLength?: number },
): Value_Stream$List {
  return new InternalValue_Stream$List(yielder, opts);
}

export function createStream$sum(
  yielder: () => Yielded<number> | null,
  opts?: { initialNominalLength?: number },
): Value_Stream$Sum {
  return new InternalValue_Stream$Sum(yielder, opts);
}

type Yielded<T> = [
  status: "ok" | "last" | "last_nominal",
  fragment: StreamFragment<T>,
];

class InternalValue_StreamBase<T> {
  constructor(
    private readonly _yielder: () => Yielded<T> | null,
    private readonly _opts?: { initialNominalLength?: number },
  ) {}

  private readonly _underlying: Yielded<T>[] = //
    new Array(this._opts?.initialNominalLength ?? 0);

  /**
   * 目前实际产生的元素的数量。
   */
  private _actualLength = 0;
  /**
   * 是否实际无法产生更多元素。
   */
  private _isExhausted = false;
  /**
   * 通过 _fill 确定了的名义上元素的数量。
   */
  private _confirmedNominalLength?: number;
  /**
   * 是否已经确定了名义上的元素的数量。
   */
  private get _hasSatisfiedNominal() {
    return this._confirmedNominalLength !== undefined;
  }
  get availableNominalLength(): number {
    return this._confirmedNominalLength ?? this._actualLength;
  }

  at(index: number): T | null {
    const yielded = this._fill({ index });
    if (!yielded) return null;
    const [_1, [[_, item]]] = yielded;
    return item;
  }

  atWithStatus(index: number): ["ok" | "last" | "last_nominal", T] | null {
    const yielded = this._fill({ index });
    if (!yielded) return null;
    const [status, [[_, item]]] = yielded;
    return [status, item];
  }

  /**
   * 获取对应于其名义长度的列表。
   */
  protected get _nominalList(): T[] {
    this._fill({ allNominal: true });
    return (this._confirmedNominalLength! === this._actualLength
      ? this._underlying
      : this._underlying.slice(0, this._confirmedNominalLength))
      .map(([_1, [[_2, v]]]) => v);
  }

  get availableFragments(): StreamFragment<T>[] {
    return (this.availableNominalLength! === this._actualLength
      ? (this._underlying.length === this._actualLength
        ? this._underlying
        : this._underlying.slice(0, this._actualLength))
      : this._underlying.slice(0, this.availableNominalLength))
      .map(([_1, f]) => f);
  }

  /**
   * 若参数为 to.index：
   * - 将实际产生的元素填充至 to.index 能获取到元素的数目，即 to.index + 1 个。
   * - 返回位于 toIndex 的元素（若不存在，返回 null）。
   *
   * 若参数为 to.allNominal：
   * - 将实际产生的元素填充至名义上的结束的数目。
   * - 返回 null。
   */
  private _fill(
    to: { index: number } | { allNominal: true },
  ): Yielded<T> | null {
    if ("index" in to && to.index < this._actualLength) {
      return this._underlying[to.index]!;
    }
    if (this._isExhausted) return null;

    const p = "index" in to
      ? () => this._actualLength <= to.index
      : () => !this._hasSatisfiedNominal;

    let lastFilled: Yielded<T> | null = null;
    for (; p(); this._actualLength++) {
      lastFilled = this._yielder();
      if (!lastFilled) {
        this._isExhausted = true;
        this._confirmedNominalLength = this._actualLength;
        break;
      }
      this._underlying[this._actualLength] = lastFilled;
      if (lastFilled[0] === "last") {
        this._isExhausted = true;
        this._actualLength++;
        this._confirmedNominalLength = this._actualLength;
        break;
      } else if (lastFilled[0] === "last_nominal") {
        this._confirmedNominalLength = this._actualLength + 1;
      }
    }

    if ("index" in to) {
      return this._actualLength === to.index + 1 ? lastFilled : null;
    } else {
      return null;
    }
  }
}

class InternalValue_Stream$List extends InternalValue_StreamBase<ValueBox>
  implements Value_Stream$List {
  readonly type = "stream$list";

  castImplicitly(): Value_List {
    return createValue.list(this._nominalList);
  }
}

class InternalValue_Stream$Sum extends InternalValue_StreamBase<number>
  implements Value_Stream$Sum {
  readonly type = "stream$sum";

  castImplicitly(): number {
    return this._nominalList.reduce((acc, cur) => acc + cur, 0);
  }
}
