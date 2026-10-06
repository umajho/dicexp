//! Exact port of naive's RNG stack:
//! `esm-seedrandom`'s `prng_xorshift7` (32-bit-integer seed path incl. its
//! seed-mixing) and `RandomGenerator.integer()` from
//! `packages/naive-evaluator/src/executing/random.ts` (unbiased rejection
//! sampling over u32/u64). Same seed ⇒ same stream as naive.

use std::cell::Cell;

thread_local! {
    static X: Cell<[i32; 8]> = const { Cell::new([0; 8]) };
    static I: Cell<usize> = const { Cell::new(0) };
    static SEEDED: Cell<bool> = const { Cell::new(false) };
}

/// JS `>>>` (unsigned right shift) on an i32.
#[inline(always)]
fn ushr(x: i32, k: u32) -> i32 {
    ((x as u32) >> k) as i32
}

/// One xorshift7 step, on the state in "rotated" coordinates: the state is
/// viewed as `(a0, …, a7)` where `a_k == x[(i + k) & 7]` for the generator's
/// current index `i`. A step reads `x[i]`, `x[i+1]`, `x[i+3]`, `x[i+4]`,
/// `x[i+7]` — i.e. `a0, a1, a3, a4, a7` — writes the result into `x[i]`,
/// and advances `i` by one, which in rotated coordinates is a left rotation
/// with the new value as the tail (see `seed`). `next_i32` runs the same
/// helper, so the discard loop and the draw path are bit-for-bit identical
/// by construction.
#[inline(always)]
fn step_v(a0: i32, a1: i32, a3: i32, a4: i32, a7: i32) -> i32 {
    let t = a0 ^ ushr(a0, 7);
    let mut v = t ^ t.wrapping_shl(24);
    v ^= a1 ^ ushr(a1, 10);
    v ^= a3 ^ ushr(a3, 3);
    v ^= a4 ^ a4.wrapping_shl(7);
    let t2 = a7 ^ a7.wrapping_shl(13);
    v ^ t2 ^ t2.wrapping_shl(9)
}

/// `seed(seed: i32)` — the ABI seeds with an i32, so we always take
/// xorshift7's 32-bit-integer seed path (`seed === (seed | 0)` in JS).
pub(crate) fn seed(seed: i32) {
    let mut x = [0i32; 8];
    x[0] = seed;
    // "Enforce an array length of 8, not all zeroes."
    if x.iter().all(|&v| v == 0) {
        x[7] = -1;
    }
    // Discard an initial 256 values. The state stays in locals (wasm
    // registers) for the whole loop — the thread-locals are touched once,
    // at the end, instead of copying the [i32; 8] state in/out of a Cell
    // and paying the `ensure_seeded` check on each of the 256 steps. Each
    // step is the rotation documented on `step_v`; 256 ≡ 0 (mod 8), so
    // afterwards the rotated view maps back onto `x` slot-for-slot with
    // `i == 0`.
    let mut a = (x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7]);
    for _ in 0..256 {
        let v = step_v(a.0, a.1, a.3, a.4, a.7);
        a = (a.1, a.2, a.3, a.4, a.5, a.6, a.7, v);
    }
    X.with(|c| c.set([a.0, a.1, a.2, a.3, a.4, a.5, a.6, a.7]));
    I.with(|c| c.set(0));
    SEEDED.with(|c| c.set(true));
}

#[inline(always)]
fn ensure_seeded() {
    if !SEEDED.with(Cell::get) {
        seed(0);
    }
}

/// `XorShift7Gen.next()` — returns the raw signed 32-bit state value.
/// One thread-local read and one write per draw; the arithmetic is shared
/// with `seed`'s discard loop via `step_v`.
fn next_i32() -> i32 {
    ensure_seeded();
    let i = I.with(Cell::get);
    let mut x = X.with(Cell::get);
    let v = step_v(x[i], x[(i + 1) & 7], x[(i + 3) & 7], x[(i + 4) & 7], x[(i + 7) & 7]);
    x[i] = v;
    X.with(|c| c.set(x));
    I.with(|c| c.set((i + 1) & 7));
    v
}

/// `RandomSource.uint32()` (`prng.int32() >>> 0`).
#[inline(always)]
pub(crate) fn next_u32() -> u32 {
    next_i32() as u32
}

/// Closed-interval unbiased integer, ported from naive's `integer()`.
/// naive throws `Unimplemented` for ranges wider than 2^53; since operands
/// are bounded by ±(2^53−1), `sides` can reach 2^54−1 — we extend the u64
/// path (exact integer math) instead of crashing ([DEVIATION], see report).
pub(crate) fn integer(lower: i64, upper: i64) -> i64 {
    let (lower, upper) = if lower > upper { (upper, lower) } else { (lower, upper) };
    let sides = (upper as i128 - lower as i128 + 1) as u128;
    if sides <= (1u128 << 32) {
        lower + integer_n32(sides as u64) as i64
    } else {
        lower + integer_n64(sides) as i64
    }
}

/// 0..n-1 via u32 rejection sampling (naive `_integerN32`).
fn integer_n32(n: u64) -> u64 {
    let max_unbiased: u64 = if n <= 2 {
        u32::MAX as u64
    } else {
        (1u64 << 32) / n * n - 1
    };
    loop {
        let rn = next_u32() as u64;
        if rn <= max_unbiased {
            return rn % n;
        }
    }
}

/// 0..n-1 via u64 rejection sampling (naive `_integerN64`; u128 keeps the
/// `2^64 / n * n - 1` computation exact for any n < 2^64).
fn integer_n64(n: u128) -> u64 {
    let max_unbiased: u128 = (1u128 << 64) / n * n - 1;
    loop {
        // Draw order matters: lower 32 bits first, then higher 32 bits.
        let lower32 = next_u32() as u128;
        let higher32 = next_u32() as u128;
        let rn = lower32 + (higher32 << 32);
        if rn <= max_unbiased {
            return (rn % n) as u64;
        }
    }
}
