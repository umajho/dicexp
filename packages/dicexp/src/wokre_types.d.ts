import type { EvaluateOptions, EvaluationResult } from "./evaluate";

export type DataToWorker =
  | [type: "initialize", init: WorkerInit]
  | [type: "evaluate", id: string, code: string, opts?: EvaluateOptions];

export type DataFromWorker =
  | [type: "initialize_result", result: InitializationResult]
  | [type: "heartbeat"]
  | [
    type: "evaluate_result",
    id: string,
    result: EvaluationResult,
    errorType: EvaluatingSpecialErrorType | null,
  ];

export interface WorkerInit {
  /**
   * 参见 EvaluatingWorkerManagerOptions 下的同名字段。
   */
  minHeartbeatInterval: { ms: number };
}

export type InitializationResult =
  | { ok: true; error?: never }
  | { ok?: never; error: Error };

export type EvaluatingSpecialErrorType =
  | "parsing_error"
  | "runtime_error";
