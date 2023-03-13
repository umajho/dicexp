// import { MersenneTwister } from "npm:random-seedable@1";
import { prng_xorshift7 } from "https://cdn.jsdelivr.net/npm/esm-seedrandom@3.0.5/esm/index.mjs";

import { Node } from "../parsing/building_blocks.ts";
import { parse, ParseOptions } from "../parsing/parse.ts";
import {
  JSValue,
  RandomGenerator,
  Runtime,
  RuntimeOptions,
} from "./runtime.ts";
import { RuntimeError } from "./runtime_errors.ts";

export type ExecuteOptions = Partial<RuntimeOptions> & {
  parseOpts?: ParseOptions;
};

export interface ExecutionResult {
  value: JSValue | null;
  runtimeError: RuntimeError | null;
  // TODO: finalStep
}

export function execute(
  node: string | Node,
  opts: ExecuteOptions = {},
): ExecutionResult {
  if (!opts.rng) {
    opts.rng = new RandomGeneratorWrapper(prng_xorshift7(Math.random()));
  }

  if (typeof node == "string") {
    node = parse(node);
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
