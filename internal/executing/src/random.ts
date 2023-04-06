import { Unimplemented, Unreachable } from "@dicexp/errors";

export interface RandomSource {
  uint32(): number;
}

export class RandomGenerator {
  constructor(
    private readonly source: RandomSource,
  ) {}

  remain = new Uint32Array(1);
  remainBits = 0;

  private _resetRemain() {
    this.remain[0] = this.source.uint32();
    this.remainBits = 32;
  }

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
    const requiredBits = getBits(n);

    let usedBits = requiredBits;
    let rn: number;

    while (true) {
      if (this.remainBits < usedBits) {
        this._resetRemain();
      }

      if (usedBits === 32) {
        rn = this.remain[0];
      } else {
        const mask = (1 << usedBits) - 1;
        rn = this.remain[0] & mask;
      }

      const maxUnbiased = n <= 2
        ? 2 ** this.remainBits - 1
        : (2 ** this.remainBits / n | 0) * n - 1;

      if (rn <= maxUnbiased) break;

      if (usedBits === 32) {
        usedBits = 0;
        this._resetRemain();
      } else {
        usedBits++;
      }
    }

    this.remain[0] >>= usedBits;
    this.remainBits -= usedBits;

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

function getBits(n: number) {
  if (!n) throw new Unreachable();
  let count = 1;
  for (n >>= 1; n; n >>= 1) {
    count++;
  }
  return count;
}
