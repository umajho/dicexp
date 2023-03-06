import { RandomGenerator } from "./runtime.ts";

/**
 * TODO: 变成 ValueGenerator
 * @param rng
 * @param amount
 * @param bounds
 * @returns
 */
export function generateRandomNumber(
  rng: RandomGenerator,
  amount: number,
  bounds: [number, number],
): number {
  if (bounds[0] > bounds[1]) {
    bounds = [bounds[1], bounds[0]];
  }
  const [lower, upper] = bounds;

  let result = 0;
  for (let i = 0; i < amount; i++) {
    const sides = upper - lower + 1;
    const maxUnbiased = (2 ** 32 / sides | 0) * sides - 1;
    let rn = rng.uint32();
    while (rn > maxUnbiased) {
      rn = rng.uint32();
    }
    const single = lower + (rn % sides);
    result += single;
  }

  return result;
}
