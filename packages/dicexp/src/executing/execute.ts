// import { MersenneTwister } from "npm:random-seedable@1";
// @ts-ignore
import { prng_xorshift7 } from "esm-seedrandom";

import { Node } from "@dicexp/nodes";
import { ExecutionResult, Runtime } from "./runtime";
import { RandomSource } from "./random";
import { Restrictions } from "./restrictions";
import { Scope } from "@dicexp/runtime/values";
export type { ExecutionResult } from "./runtime";

export type ExecuteOptions =
  & {
    topLevelScope: Scope;
    restrictions?: Restrictions;
  }
  & (
    {
      randomSource: RandomSource;
    } | {
      seed?: number;
    }
  );

/**
 * @param node
 * @param opts
 * @returns
 */
export function execute(
  node: Node,
  opts: ExecuteOptions,
): ExecutionResult {
  let randomSource: RandomSource;
  if ("randomSource" in opts) {
    randomSource = opts.randomSource;
  } else {
    const seed = opts.seed ?? Math.random();
    randomSource = new RandomSourceWrapper(prng_xorshift7(seed));
  }

  const restrictions = opts.restrictions ?? {};

  const runtime = new Runtime(node, {
    topLevelScope: opts.topLevelScope,
    randomSource,
    restrictions,
  });
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
