// import { MersenneTwister } from "npm:random-seedable@1";
import { prng_xorshift7 } from "esm-seedrandom";

import type { Node } from "@dicexp/nodes";
import { type ExecutionResult, Runtime, type RuntimeOptions } from "./runtime";
import type { RandomSource } from "./random";
export type { ExecutionResult } from "./runtime";

export type ExecuteOptions = Partial<RuntimeOptions> & {
  seed?: number;
};

export function execute(
  node: Node,
  opts: ExecuteOptions = {},
): ExecutionResult {
  if (!opts.randomSource) {
    if (opts.seed === undefined) {
      opts.seed = Math.random();
    }
    opts.randomSource = new RandomSourceWrapper(prng_xorshift7(opts.seed));
  } else {
    if (opts.seed !== undefined) {
      if (
        "console" in globalThis && "warn" in globalThis.console &&
        typeof globalThis.console.warn === "function"
      ) {
        globalThis.console.warn("由于已传入随机数生成器，seed 被忽略。");
      }
    }
  }

  if (!opts.restrictions) {
    opts.restrictions = {};
  }

  const runtime = new Runtime(node, opts as RuntimeOptions);
  return runtime.execute();
}

class RandomSourceWrapper implements RandomSource {
  rng: { int32: () => number };

  constructor(rng: { int32: () => number }) {
    this.rng = rng;
  }

  uint32(): number {
    return this.rng.int32() >>> 0;
  }
}
