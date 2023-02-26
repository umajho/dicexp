import { XORWow } from "npm:random-seedable@1";
import { Node } from "../parsing/building_blocks.ts";
import { parse } from "../parsing/parse.ts";
import { RandomGenerator, Runtime, RuntimeOptions } from "./runtime.ts";

export function execute(node: string | Node, opts?: RuntimeOptions) {
  if (!opts) {
    opts = {
      rng: new RandomGeneratorWrapper(new XORWow()),
    };
  }

  if (typeof node == "string") {
    node = parse(node);
  }

  return (new Runtime(node, opts)).executeAndTranslate();
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
