import {
  BasicEvaluationOptions,
  BasicEvaluationResult,
  BasicParseError,
} from "./dicexp";

export interface AsyncEvaluator<TopLevelScope> {
  evaluate: (code: string, opts: BasicEvaluationOptions<TopLevelScope>) => //
  Promise<BasicEvaluationResult>;

  batchEvaluate: (code: string, opts: BasicEvaluationOptions<TopLevelScope>) => //
  AsyncGenerator<
    BatchOkReport<"continue">,
    BatchOkReport<"stop"> | BatchErrorReport
  >;
}

export type BatchOkReport<Type extends "continue" | "stop"> = //
  [Type, BasicBatchResult, BasicBatchStatistic | null];

export type BatchErrorReport =
  | ["error", "parse", BasicParseError]
  | ["error", "batch", Error, BasicBatchResult, BasicBatchStatistic | null]
  | ["error", "other", Error];

export interface BasicBatchResult {
  samples: number;
  counts: { [n: number]: number };
}
export interface BasicBatchStatistic {
  start: { ms: number };
  now: { ms: number };
}
