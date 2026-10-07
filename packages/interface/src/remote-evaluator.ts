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

export interface RemoteSamplingOptions extends EvaluationGenerationOptions {
  /**
   * 抽样控制选项（由远程抽样通道处理；本地求值器忽略）。
   */
  sampling?: {
    /**
     * 采集到该数量的样本后自动停止抽样。种子按 0、1、2、… 依次使用，
     * 因此 N 个样本对应种子 0 至 N-1。非正数或缺失表示不限制。
     */
    maxSamples?: number;
  };
}

export interface RemoteSamplerClient {
  keepSampling: (
    code: string,
    opts: RemoteSamplingOptions,
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
