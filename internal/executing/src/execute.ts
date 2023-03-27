// import { MersenneTwister } from "npm:random-seedable@1";
import { prng_xorshift7 } from "esm-seedrandom";

import type { Node } from "@dicexp/nodes";
import {
  type JSValue,
  type RandomGenerator,
  Runtime,
  type RuntimeOptions,
} from "./runtime";
import type { RuntimeError } from "./runtime_errors";

export type ExecuteOptions = Partial<RuntimeOptions> & {
  seed?: number;
};

export interface ExecutionResult {
  value: JSValue | null;
  runtimeError: RuntimeError | null;
  // TODO: finalStep
}

export function execute(
  node: Node,
  opts: ExecuteOptions = {},
): ExecutionResult {
  if (!opts.rng) {
    if (opts.seed === undefined) {
      opts.seed = Math.random();
    }
    opts.rng = new RandomGeneratorWrapper(prng_xorshift7(opts.seed));
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

  const runtime = new Runtime(node, opts as RuntimeOptions);
  const [value, error] = runtime.executeAndTranslate();

  return { value, runtimeError: error };
}

class RandomGeneratorWrapper implements RandomGenerator {
  rng: { int32: () => number };

  constructor(rng: { int32: () => number }) {
    this.rng = rng;
  }

  uint32(): number {
    return this.rng.int32() >>> 0;
  }
}
