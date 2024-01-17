import { Repr } from "./repr";

export interface Evaluator {
  evaluate: (code: string, opts: EvaluationOptions) => EvaluationResult;

  makeEvaluationGenerator: (
    code: string,
    opts: EvaluationGenerationOptions,
  ) => MakeEvaluationGeneratorResult;
}

export interface EvaluationOptions {
  parse?: {};
  execution: {
    /**
     * 单次求值中随机数生成器使用的种子。
     */
    seed: number;
    restrictions?: ExecutionRestrictions;
  };
}

export interface ExecutionRestrictions {
  /**
   * 执行代码时会试着遵守的超时时长。
   *
   * 由于在检查点间执行的代码时长无法保证，代码执行时间即使远超超时时长也有可
   * 能不会终止，因此不能将其视为硬性指标。
   */
  softTimeout?: { ms: number };
}

export interface EvaluationGenerationOptions {
  parse?: {};
  execution?: {};
}

export type EvaluationResult =
  | ["ok", JSValue, ExecutionAppendix]
  | ["error", "parse", ParseError]
  | ["error", "runtime", RuntimeError, ExecutionAppendix]
  | ["error", "other", Error];

export type MakeEvaluationGeneratorResult =
  | ["ok", EvaluationGenerator]
  | ["error", "parse", ParseError]
  | ["error", "other", Error];
export type EvaluationGenerator = Generator<
  ["ok", JSValue, ExecutionAppendix],
  | ["error", "runtime", RuntimeError, ExecutionAppendix]
  | ["error", "other", Error]
>;

export type JSValue = number | boolean | JSValue[];

export interface ExecutionAppendix {
  representation: Repr;
  statistics: ExecutionStatistics;
}

export interface ExecutionStatistics {
  timeConsumption: { ms: number };
}

export interface ParseError {
  message: string;
}

export interface RuntimeError {
  message: string;
}
