import { Unimplemented } from "@dicexp/errors";
import type { RandomGenerator as IRandomGenerator } from "@dicexp/runtime/values";

export interface RandomSource {
  uint32(): number;
}

export class RandomGenerator implements IRandomGenerator {
  constructor(
    private readonly source: RandomSource,
  ) {}

  /**
   * 闭区间。
   */
  integer(lower: number, upper: number): number {
    if (lower > upper) {
      [lower, upper] = [upper, lower];
    }

    const sides = upper - lower + 1;
    if (sides <= 2 ** 32) {
      return lower + this._integerN32(sides);
    } else if (sides <= 2 ** 53) {
      return lower + this._integerN64(sides);
    }
    throw new Unimplemented();
  }

  /**
   * 0 至 n-1。
   */
  private _integerN32(n: number): number {
    let maxUnbiased: number;
    if (n <= 2) {
      maxUnbiased = 2 ** 32 - 1;
    } else {
      maxUnbiased = (2 ** 32 / n | 0) * n - 1;
    }

    let rn: number;
    do {
      rn = this.source.uint32();
    } while (rn > maxUnbiased);

    return rn % n;
  }

  /**
   * 0 至 n-1。
   */
  private _integerN64(nAsNumber: number): number {
    const n = BigInt(nAsNumber);
    let maxUnbiased: bigint;
    maxUnbiased = (BigInt(2 ** 64) / n) * n - BigInt(1);

    let rn: bigint;
    do {
      const lower32 = BigInt(this.source.uint32());
      const higher32 = BigInt(this.source.uint32());
      rn = lower32 + higher32 * BigInt(2 ** 32);
    } while (rn > maxUnbiased);
    return Number(rn % n);
  }
}
