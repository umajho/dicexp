import { MersenneTwister } from "npm:random-seedable@1";
import { Node } from "../parsing/building_blocks.ts";
import { parse, ParseOptions } from "../parsing/parse.ts";
import { RandomGenerator, Runtime, RuntimeOptions } from "./runtime.ts";

export type ExecuteOptions = Partial<RuntimeOptions> & {
  parseOpts?: ParseOptions;
};

export function execute(node: string | Node, opts: ExecuteOptions = {}) {
  if (!opts.rng) {
    opts.rng = new RandomGeneratorWrapper(new MersenneTwister());
  }

  if (typeof node == "string") {
    node = parse(node);
  }

  return (new Runtime(node, opts as RuntimeOptions)).executeAndTranslate();
}

class RandomGeneratorWrapper implements RandomGenerator {
  rng: { int: () => number };

  constructor(rng: { int: () => number }) {
    this.rng = rng;
  }

  int32(): number {
    return this.rng.int();
  }
}
