import { RandomGenerator } from "./runtime.ts";

export function generateRandomNumber(
  rng: RandomGenerator,
  bounds: [number, number],
): number {
  if (bounds[0] > bounds[1]) {
    bounds = [bounds[1], bounds[0]];
  }
  const [lower, upper] = bounds;

  const sides = upper - lower + 1;
  const maxUnbiased = (2 ** 32 / sides | 0) * sides - 1;
  let rn = rng.uint32();
  while (rn > maxUnbiased) {
    rn = rng.uint32();
  }
  const single = lower + (rn % sides);
  return single;
}
