// Throwaway generator for `rng_fixture.txt`.
//
// Ports naive's RNG stack EXACTLY:
//   - `prng_xorshift7` from the repo-pinned `esm-seedrandom@3.0.5`
//     (packages/naive-evaluator uses it via `RandomSourceWrapper`,
//      whose `uint32()` is `prng.int32() >>> 0`), and
//   - `RandomGenerator.integer()` from
//     `packages/naive-evaluator/src/executing/random.ts`
//     (unbiased rejection sampling over u32/u64).
//
// Run from the repository root:  node <this file> > rng_fixture.txt
// The Rust port in `src/rng.rs` must reproduce every line byte-for-byte.

import { prng_xorshift7 } from "../../../../../node_modules/.pnpm/esm-seedrandom@3.0.5/node_modules/esm-seedrandom/esm/xorshift7.mjs";

// --- verbatim port of packages/naive-evaluator/src/executing/random.ts ---
class RandomGenerator {
  constructor(source) {
    this.source = source;
  }

  /** 闭区间。 */
  integer(lower, upper) {
    if (lower > upper) {
      [lower, upper] = [upper, lower];
    }

    const sides = upper - lower + 1;
    if (sides <= 2 ** 32) {
      return lower + this._integerN32(sides);
    } else if (sides <= 2 ** 53) {
      return lower + this._integerN64(sides);
    }
    throw new Error("Unimplemented");
  }

  /** 0 至 n-1。 */
  _integerN32(n) {
    let maxUnbiased;
    if (n <= 2) {
      maxUnbiased = 2 ** 32 - 1;
    } else {
      maxUnbiased = (2 ** 32 / n | 0) * n - 1;
    }

    let rn;
    do {
      rn = this.source.uint32();
    } while (rn > maxUnbiased);

    return rn % n;
  }

  /** 0 至 n-1。 */
  _integerN64(nAsNumber) {
    const n = BigInt(nAsNumber);
    const maxUnbiased = (BigInt(2 ** 64) / n) * n - BigInt(1);

    let rn;
    do {
      const lower32 = BigInt(this.source.uint32());
      const higher32 = BigInt(this.source.uint32());
      rn = lower32 + higher32 * BigInt(2 ** 32);
    } while (rn > maxUnbiased);
    return Number(rn % n);
  }
}

function makeRng(seed) {
  const prng = prng_xorshift7(seed);
  return new RandomGenerator({ uint32: () => prng.int32() >>> 0 });
}

const lines = [];

function emitUint32(seed, count) {
  const prng = prng_xorshift7(seed);
  const out = [];
  for (let i = 0; i < count; i++) out.push(prng.int32() >>> 0);
  lines.push(`u32 ${seed} ${out.join(",")}`);
}

function emitInteger(name, seed, lower, upper, count) {
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < count; i++) out.push(rng.integer(lower, upper));
  lines.push(`int ${seed} ${lower} ${upper} ${out.join(",")  }`);
}

// Raw uint32 streams for a spread of i32 seeds.
for (const seed of [0, 1, 42, -1, 2147483647, -2147483648]) {
  emitUint32(seed, 16);
}

// integer() streams: N32 path (incl. the n<=2 and sides==2^32 edges),
// swapped bounds, negative bounds, and N64 path (sides > 2^32).
emitInteger("d6", 0, 1, 6, 20);
emitInteger("d6_s1", 1, 1, 6, 20);
emitInteger("d6_s42", 42, 1, 6, 20);
emitInteger("coin", 7, 1, 2, 20);
emitInteger("2_10", 3, 2, 10, 20);
emitInteger("swapped", 5, 10, 2, 10);
emitInteger("neg", 11, -5, 5, 20);
emitInteger("d100", 13, 1, 100, 20);
emitInteger("u32max", 9, 0, 2 ** 32 - 1, 10);
emitInteger("big40", 42, 1, 2 ** 40 + 12345, 10);
emitInteger("max53", 42, 1, Number.MAX_SAFE_INTEGER, 5);
emitInteger("bigneg", 17, -(2 ** 40), 2 ** 40 + 7, 10);

process.stdout.write(lines.join("\n") + "\n");
