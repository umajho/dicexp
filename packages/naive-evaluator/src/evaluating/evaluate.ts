// import { MersenneTwister } from "npm:random-seedable@1";
// @ts-ignore
import { prng_xorshift7 } from "esm-seedrandom";

import { Unreachable } from "@dicexp/errors";

import {
  EvaluationGenerationOptions,
  EvaluationGenerator,
  EvaluationOptions,
  Evaluator as IEvaluator,
  ExecutionRestrictions,
  JSValue,
  MakeEvaluationGeneratorResult,
} from "@dicexp/interface";

import { Node, parse, ParseError, ParseResult } from "../parsing/mod";

import { Scope } from "@dicexp/naive-evaluator-runtime/scopes";

import {
  execute,
  ExecutionAppendix,
  ExecutionResult,
  RandomSource,
  RuntimeError,
} from "../executing/mod";

export type EvaluationResult =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "parse", ParseError]
  | ["error", "runtime", RuntimeError, ExecutionAppendix]
  | ["error", "other", Error];

export interface NewEvaluatorOptions {
  topLevelScope: Scope;
  randomSourceMaker: ((seed: number) => RandomSource) | "xorshift7";
}

export class Evaluator implements IEvaluator {
  private topLevelScope!: Scope;
  private randomSourceMaker!: (seed: number) => RandomSource;

  constructor(
    opts: NewEvaluatorOptions,
  ) {
    this.topLevelScope = opts.topLevelScope;

    if (typeof opts.randomSourceMaker === "function") {
      this.randomSourceMaker = opts.randomSourceMaker;
    } else {
      switch (opts.randomSourceMaker) {
        case "xorshift7":
          this.randomSourceMaker = (seed: number) =>
            new RandomSourceWrapper(prng_xorshift7(seed));
          break;
        default:
          throw new Unreachable();
      }
    }
  }

  parse(code: string): ParseResult {
    return parse(code);
  }

  execute(
    node: Node,
    opts: { seed: number; restrictions?: ExecutionRestrictions },
  ): ExecutionResult {
    return execute(node, {
      topLevelScope: this.topLevelScope,
      restrictions: {
        ...(opts.restrictions ? opts.restrictions : {}),
      },
      randomSource: this.randomSourceMaker(opts.seed),
    });
  }

  evaluate(
    code: string,
    opts: EvaluationOptions,
  ): EvaluationResult {
    const parseResult = this.parse(code);
    if (parseResult[0] === "error") return ["error", "parse", parseResult[1]];
    // parseResult[0] === "ok"
    const node = parseResult[1];

    const result = this.execute(node, opts.execution);
    if (result[0] === "ok") {
      return result;
    } else { // result[0] === "error" && result[1] === "runtime"
      return ["error", result[1], result[2], result[3]];
    }
  }

  makeEvaluationGenerator(
    code: string,
    _opts: EvaluationGenerationOptions,
  ): MakeEvaluationGeneratorResult {
    const zis = this;

    const parseResult = this.parse(code);
    if (parseResult[0] === "error") return ["error", "parse", parseResult[1]];
    return [
      "ok",
      (function* (): EvaluationGenerator {
        const node = parseResult[1];

        // TODO: seed 到达最大有效值后停止循环（要报错吗？），
        // 或者回到 0 重新开始？
        for (let seed = 0;; seed++) {
          const result = zis.execute(node, { seed });
          if (result[0] === "ok") {
            yield result;
          } else {
            return result;
          }
        }
      })(),
    ];
  }
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
