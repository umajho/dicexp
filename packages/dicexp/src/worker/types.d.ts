import { ExecuteOptions } from "@dicexp/executing";
import { ErrorDataFromWorker } from "../error_from_worker";
import { ParseOptions } from "@dicexp/parsing";

export interface EvaluateOptionsForWorker {
  execute: ExecuteOptionsForWorker;
  parse?: ParseOptions;

  restrictions?: {
    hardTimeout?: { ms: number };
  };
}

export type EvaluationRestrictionsForWorker =
  EvaluateOptionsForWorker["restrictions"];

export interface ExecuteOptionsForWorker {
  topLevelScopeName: "barebones" | "standard";
  restrictions?: Restrictions;
  seed?: number;
}

export type DataToWorker =
  | [type: "initialize", init: WorkerInit]
  | [
    type: "evaluate",
    id: string,
    code: string,
    opts: EvaluateOptionsForWorker,
  ]
  | [
    type: "batch_start",
    id: string,
    code: string,
    opts: EvaluateOptionsForWorker,
  ]
  | [type: "batch_stop", id: string];

export type DataFromWorker =
  | [type: "initialize_result", result: InitializationResult]
  | [type: "heartbeat"]
  | [
    type: "evaluate_result",
    id: string,
    result: EvaluationResult,
    errorData: ErrorDataFromWorker | null,
  ]
  | [
    type: "batch_report",
    id: string,
    report: BatchReport,
    stopped: boolean,
    errorData: ErrorDataFromWorker | null,
  ]
  | [type: "fatal", reason?: string];

/**
 * 这里的字段来源于 `EvaluatingWorkerClientOptions`
 */
export interface WorkerInit {
  minHeartbeatInterval: { ms: number };
  batchReportInterval: { ms: number };
}

export type InitializationResult =
  | { ok: true; error?: never }
  | { ok?: never; error: ErrorDataFromWorker };

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
  stopped?: boolean;
}
