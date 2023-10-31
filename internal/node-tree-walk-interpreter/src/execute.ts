// import { MersenneTwister } from "npm:random-seedable@1";
// @ts-ignore
import { prng_xorshift7 } from "esm-seedrandom";

import { Node } from "@dicexp/nodes";
import { Scope } from "@dicexp/runtime/scopes";

import { ExecutionResult, Runtime } from "./runtime";
import { RandomSource } from "./random";
import { Restrictions } from "./restrictions";
import { BasicExecutionOptions, Execute } from "@dicexp/interface";
export type { ExecutionResult } from "./runtime";

export type ExecutionOptions =
  & BasicExecutionOptions<Scope>
  & { restrictions?: Restrictions }
  & (
    | { randomSource: RandomSource }
    | { seed?: number }
  );

/**
 * @param node
 * @param opts
 * @returns
 */
export const execute = //
  ((node: Node, opts: ExecutionOptions): ExecutionResult => {
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
  }) satisfies Execute<Node, Scope>;

class RandomSourceWrapper implements RandomSource {
  rng: { int32: () => number };

  constructor(rng: { int32: () => number }) {
    this.rng = rng;
  }

  uint32(): number {
    return this.rng.int32() >>> 0;
  }
}
