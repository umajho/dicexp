import type { EvaluateOptions, EvaluationResult } from "./evaluate";

export type DataToWorker =
  | [type: "initialize", init: WorkerInit]
  | [type: "evaluate", id: string, code: string, opts?: EvaluateOptions]
  | [type: "batch_start", id: string, code: string, opts?: EvaluateOptions]
  | [type: "batch_stop", id: string];

export type DataFromWorker =
  | [type: "initialize_result", result: InitializationResult]
  | [type: "heartbeat"]
  | [
    type: "evaluate_result",
    id: string,
    result: EvaluationResult,
    errorType: EvaluatingSpecialErrorType | null,
  ]
  | [type: "batch_report", id: string, report: BatchReport, stopped: boolean];

/**
 * 这里的字段来源于 `EvaluatingWorkerClientOptions`
 */
export interface WorkerInit {
  minHeartbeatInterval: { ms: number };
  batchReportInterval: { ms: number };
}

export type InitializationResult =
  | { ok: true; error?: never }
  | { ok?: never; error: Error };

export type EvaluatingSpecialErrorType =
  | "parsing_error"
  | "runtime_error";

export interface BatchReport { // 为了不浪费已有数据， ok 和 error 可以同时存在
  ok?: {
    samples: number;
    counts: { [n: number]: number };
  };
  error?: Error;
  statistics?: {
    start: { ms: number };
    now: { ms: number };
  };
}
