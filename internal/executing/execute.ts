// import { MersenneTwister } from "npm:random-seedable@1";
import { prng_xorshift7 } from "https://cdn.jsdelivr.net/npm/esm-seedrandom@3.0.5/esm/index.mjs";
import { Node } from "../parsing/building_blocks.ts";
import { parse, ParseOptions } from "../parsing/parse.ts";
import { RandomGenerator, Runtime, RuntimeOptions } from "./runtime.ts";

export type ExecuteOptions = Partial<RuntimeOptions> & {
  parseOpts?: ParseOptions;
};

export function execute(node: string | Node, opts: ExecuteOptions = {}) {
  if (!opts.rng) {
    opts.rng = new RandomGeneratorWrapper(prng_xorshift7(Math.random()));
  }

  if (typeof node == "string") {
    node = parse(node);
  }

  return (new Runtime(node, opts as RuntimeOptions)).executeAndTranslate();
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
