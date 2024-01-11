import type {
  EvaluationResult,
  ParseError,
  ParseOptions,
  RuntimeRestrictions,
} from "dicexp/internal";

export interface MessagePoster {
  tryPostMessage(data: DataFromWorker): void;
}

export interface EvaluationOptionsForWorker {
  execution: ExecutionOptionsForWorker;
  parse?: ParseOptions;
  worker?: EvaluationOptionsForWorkerSpecified;
}

export interface ExecutionOptionsForWorker {
  topLevelScope: string;
  restrictions?: RuntimeRestrictions;
  seed?: number;
}

export interface EvaluationOptionsForWorkerSpecified {
  restrictions?: {
    hardTimeout?: { ms: number };
  };
}

export type DataToWorker =
  | [type: "initialize", init: WorkerInit]
  | [
    type: "evaluate",
    id: string,
    code: string,
    opts: EvaluationOptionsForWorker,
  ]
  | [
    type: "batch_start",
    id: string,
    code: string,
    opts: EvaluationOptionsForWorker,
  ]
  | [type: "batch_stop", id: string];

export type DataFromWorker =
  | [type: "loaded"]
  | [type: "initialize_result", result: InitializationResult]
  | [type: "heartbeat"]
  | [type: "evaluate_result", id: string, result: EvaluationResult]
  | [type: "batch_report", id: string, report: BatchReport]
  | [type: "fatal", reason?: string];

/**
 * 这里的字段来源于 `EvaluatingWorkerClientOptions`
 */
export interface WorkerInit {
  minHeartbeatInterval: { ms: number };
  batchReportInterval: { ms: number };
}

export type InitializationResult =
  | "ok"
  | ["error", Error];

export type BatchReport =
  | ["continue" | "stop", BatchResult, BatchStatistics | null]
  | ["error", "parse", ParseError]
  | ["error", "other", Error]
  | ["error", "batch", Error, BatchResult, BatchStatistics | null];
export interface BatchResult {
  samples: number;
  counts: { [n: number]: number };
}
export interface BatchStatistics {
  start: { ms: number };
  now: { ms: number };
}
