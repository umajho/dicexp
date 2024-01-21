import {
  EvaluationGenerationOptions,
  EvaluationOptions,
  EvaluationResult,
  ParseError,
} from "./evaluator";

/**
 * “Remote” 是相对于本地线程。
 */
export interface RemoteEvaluatorClient {
  evaluateRemote: (
    code: string,
    opts: RemoteEvaluationOptions,
  ) => Promise<EvaluationResult>;
}

export interface RemoteEvaluationOptions extends EvaluationOptions {
  local?: {
    restrictions?: RemoteEvaluationLocalRestrictions;
  };
}

export interface RemoteEvaluationLocalRestrictions {
  /**
   * 硬性超时。当自本地发送求值请求该时间后仍未收到结果，则视为求值失败。
   *
   * 此种超时发生后，本地应负责远程的善后。（如销毁远程端，或通知远程端取消求
   * 值。）
   */
  hardTimeout?: { ms: number };
}

export interface RemoteSamplerClient {
  keepSampling: (
    code: string,
    opts: EvaluationGenerationOptions,
  ) => AsyncGenerator<SamplingReport>;
}

export type SamplingReport =
  | SamplingOkReport<"continue">
  | SamplingOkReport<"stop">
  | SamplingErrorReport;

export type SamplingOkReport<Type extends "continue" | "stop"> = //
  [Type, SamplingResult, SamplingStatistic | null];
export type SamplingErrorReport =
  | ["error", "parse", ParseError]
  | ["error", "sampling", Error, SamplingResult, SamplingStatistic | null]
  | ["error", "other", Error];

export interface SamplingStatistic {
  start: { ms: number };
  now: { ms: number };
}

export interface SamplingResult {
  samples: number;
  counts: { [n: number]: number };
}
