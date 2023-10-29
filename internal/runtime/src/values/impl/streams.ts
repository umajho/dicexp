import { Unreachable } from "@dicexp/errors";

import { ErrorBeacon } from "../error-beacon";
import {
  createValue,
  createValueBox,
  RuntimeError,
  StreamFragment,
  Value_Stream,
  Value_Stream$List,
  Value_Stream$Sum,
  ValueBox,
} from "../mod";

export function createStream$list(
  yielder: () => Yielded<ValueBox> | null,
  opts?: StreamOptions,
): Value_Stream$List {
  const errorExtractor = (item: ValueBox, errorSetter: ErrorSetter): void => {
    if (item.confirmsError()) {
      const itemResult = item.get();
      if (itemResult[0] !== "error") throw new Unreachable();
      errorSetter(itemResult[1]);
    }
    if (item.errorBeacon) {
      item.errorBeacon.addDisposableHook((err) => errorSetter!(err));
    }
  };

  return new InternalValue_Stream(
    "stream$list",
    yielder,
    (nominalList) => createValue.list(nominalList),
    errorExtractor,
    opts,
  );
}

export function createStream$sum(
  yielder: () => Yielded<number> | null,
  opts?: StreamOptions,
): Value_Stream$Sum {
  return new InternalValue_Stream(
    "stream$sum",
    yielder,
    (nominalList) => nominalList.reduce((acc, cur) => acc + cur, 0),
    undefined,
    opts,
  );
}

export function createStreamTransformer(
  source: Value_Stream,
  transformer: (
    v: [status: "ok" | "last_nominal", v: ValueBox | number],
  ) => Transformed<ValueBox | number>,
  opts?: StreamOptions,
): Value_Stream {
  let nextAt = 0, hasNoMore = false;

  const yielder = (): Yielded<ValueBox | number> | null => {
    while (!hasNoMore) {
      let currentItem = source.atWithStatus(nextAt);
      nextAt++;
      if (!currentItem) return null;
      if (currentItem[0] === "last") {
        hasNoMore = true;
        currentItem[0] = "last_nominal";
      }
      // @ts-ignore
      const transformed = transformer(currentItem);
      if (transformed === "more") continue;
      if (transformed[0] === "ok") {
        if (transformed[1][0] === "last") {
          hasNoMore = true;
        } else if (hasNoMore) {
          transformed[1][0] = "last";
        }
        return transformed[1];
      } else if (transformed[0] === "error") {
        return ["last", [
          ["regular", createValueBox.error(transformed[1])],
          transformed[2],
        ]];
      } else {
        throw new Unreachable();
      }
    }
    return null;
  };

  if (source.type === "stream$list") {
    return createStream$list(yielder as () => Yielded<ValueBox> | null, opts);
  } else if (source.type === "stream$sum") {
    return createStream$sum(yielder as () => Yielded<number> | null, opts);
  } else {
    throw new Unreachable();
  }
}

type WithStatus<T> = [
  status: "ok" | "last" | "last_nominal",
  v: T,
];
export type Yielded<T> = WithStatus<StreamFragment<T>>;

export type Transformed<T> =
  | ["ok", Yielded<T>]
  | "more"
  | [type: "error", error: RuntimeError, abandonedBefore?: T[]];

type ErrorSetter = (error: RuntimeError) => void;

interface StreamOptions {
  initialNominalLength?: number;
}

class InternalValue_Stream<Type, T, CastingImplicitlyTo> {
  constructor(
    public readonly type: Type,
    private readonly _yielder: () => Yielded<T> | null,
    public readonly implicitCaster: (nominalList: T[]) => CastingImplicitlyTo,
    public readonly errorExtractor?: (item: T, s: ErrorSetter) => void,
    private readonly _opts?: StreamOptions,
  ) {
    if (errorExtractor) {
      this._errorBeacon = new ErrorBeacon((s) => this._errorSetter = s);
    }
  }

  private readonly _underlying: Yielded<T>[] = //
    new Array(this._opts?.initialNominalLength ?? 0);

  protected _errorBeacon?: ErrorBeacon;
  protected _errorSetter?: (error: RuntimeError) => void;

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

  atWithStatus(index: number): WithStatus<T> | null {
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
    return this.nominalFragments.map(([[_1, v], _2]) => v);
  }

  castImplicitly(): CastingImplicitlyTo {
    return this.implicitCaster(this._nominalList);
  }

  get nominalFragments(): StreamFragment<T>[] {
    return this.availableNominalLength! === this._actualLength
      ? this.actualFragments
      : this._underlying.slice(0, this.availableNominalLength)
        .map(([_1, f]) => f);
  }

  get surplusFragments(): StreamFragment<T>[] | null {
    return this.availableNominalLength! === this._actualLength
      ? null
      : this._underlying.slice(this.availableNominalLength)
        .map(([_1, f]) => f);
  }

  get actualFragments(): StreamFragment<T>[] {
    return (this._underlying.length === this._actualLength
      ? this._underlying
      : this._underlying.slice(0, this._actualLength)).map(([_1, f]) => f);
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
    if (this._isExhausted || this._errorBeacon?.comfirmsError()) return null;

    const p = "index" in to
      ? () => this._actualLength <= to.index
      : () => !this._hasSatisfiedNominal;

    let lastFilled: Yielded<T> | null = null;
    for (; p();) {
      lastFilled = this._yielder();
      if (!lastFilled) {
        this._isExhausted = true;
        this._confirmedNominalLength = this._actualLength;
        break;
      }

      this._actualLength++;

      this.errorExtractor?.(lastFilled[1][0][1], this._errorSetter!);

      let shouldBreak = this._errorBeacon?.comfirmsError();

      this._underlying[this._actualLength - 1] = lastFilled;
      if (lastFilled[0] === "last") {
        this._isExhausted = true;
        this._confirmedNominalLength = this._actualLength;
        shouldBreak = true;
      } else if (lastFilled[0] === "last_nominal") {
        this._confirmedNominalLength = this._actualLength;
      }

      if (shouldBreak) break;
    }

    if ("index" in to) {
      return this._actualLength === to.index + 1 ? lastFilled : null;
    } else {
      return null;
    }
  }
}
