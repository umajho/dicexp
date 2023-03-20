// import { MersenneTwister } from "npm:random-seedable@1";
import { prng_xorshift7 } from "esm-seedrandom";

import { Node } from "@dicexp/nodes";
import { type ParseOptions } from "@dicexp/parsing";
import { JSValue, RandomGenerator, Runtime, RuntimeOptions } from "./runtime";
import { RuntimeError } from "./runtime_errors";

export type ExecuteOptions = Partial<RuntimeOptions> & {
  parseOpts?: ParseOptions;
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
    opts.rng = new RandomGeneratorWrapper(prng_xorshift7(Math.random()));
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
