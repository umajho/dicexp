import type {
  EvaluationResult,
  ParseOptions,
  RuntimeRestrictions,
} from "dicexp/internal";
import type { Scope } from "@dicexp/runtime/values";

export interface MessagePoster {
  tryPostMessage(data: DataFromWorker): void;
}

export interface EvaluateOptionsForWorker<
  AvailableScopes extends Record<string, Scope>,
> {
  execute: Omit<ExecuteOptionsForWorker<AvailableScopes>, "restrictions">;
  parse?: ParseOptions;

  restrictions?: EvaluationRestrictionsForWorker;
}

export interface EvaluationRestrictionsForWorker {
  hardTimeout?: { ms: number };
  execute: RuntimeRestrictions;
}

export interface ExecuteOptionsForWorker<
  AvailableScopes extends Record<string, Scope>,
> {
  topLevelScopeName: keyof AvailableScopes;
  restrictions?: RuntimeRestrictions;
  seed?: number;
}

export type DataToWorker<AvailableScopes extends Record<string, Scope>> =
  | [type: "initialize", init: WorkerInit]
  | [
    type: "evaluate",
    id: string,
    code: string,
    opts: EvaluateOptionsForWorker<AvailableScopes>,
  ]
  | [
    type: "batch_start",
    id: string,
    code: string,
    opts: EvaluateOptionsForWorker<AvailableScopes>,
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
  | ["ok" | "stop", BatchResult, BatchStatistics | null]
  | ["error", "parse" | "other", Error]
  | ["error", "batch", Error, BatchResult, BatchStatistics | null];
export interface BatchResult {
  samples: number;
  counts: { [n: number]: number };
}
export interface BatchStatistics {
  start: { ms: number };
  now: { ms: number };
}
