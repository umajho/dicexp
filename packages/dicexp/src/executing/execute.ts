// import { MersenneTwister } from "npm:random-seedable@1";
import { prng_xorshift7 } from "esm-seedrandom";

import type { Node } from "@dicexp/nodes";
import { type ExecutionResult, Runtime } from "./runtime";
import type { RandomSource } from "./random";
import type { Restrictions } from "./restrictions";
import type { Scope } from "@dicexp/runtime/values";
export type { ExecutionResult } from "./runtime";

export type ExecuteOptions =
  & {
    topLevelScope: Scope | Scope[];
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
  let topLevelScope: Scope;
  if (Array.isArray(opts.topLevelScope)) {
    topLevelScope = {};
    for (const scope of opts.topLevelScope) {
      topLevelScope = { ...topLevelScope, ...scope };
    }
  } else {
    topLevelScope = opts.topLevelScope;
  }

  let randomSource: RandomSource;
  if ("randomSource" in opts) {
    randomSource = opts.randomSource;
  } else {
    const seed = opts.seed ?? Math.random();
    randomSource = new RandomSourceWrapper(prng_xorshift7(seed));
  }

  const restrictions = opts.restrictions ?? {};

  const runtime = new Runtime(node, {
    topLevelScope,
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
