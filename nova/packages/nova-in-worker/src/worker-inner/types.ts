import type * as I from "@dicexp/interface";

export type MessageToWorker = InitialMessageToWorker | MessageToServer;
export type InitialMessageToWorker = [type: "initialize", init: WorkerInit];
export type MessageToServer =
  | [
    type: "evaluate",
    id: string,
    code: string,
    newEvaluatorOpts: NewEvaluatorOptionsForWorker,
    opts: I.EvaluationOptions,
  ]
  | [
    type: "sample_start",
    id: string,
    code: string,
    newEvaluatorOpts: NewEvaluatorOptionsForWorker,
    opts: I.RemoteSamplingOptions,
  ]
  | [type: "sample_stop", id: string];

export type MessageFromWorker = InitialMessageFromWorker | MessageFromServer;
export type InitialMessageFromWorker =
  | [type: "loaded"]
  | [type: "initialize_result", result: InitializationResult];
export type MessageFromServer =
  | [type: "heartbeat"]
  | [type: "evaluate_result", id: string, result: I.EvaluationResult]
  | [type: "sampling_report", id: string, report: I.SamplingReport]
  | [type: "fatal", reason?: string];

/**
 * Currently empty; reserved for future options, kept so the protocol stays
 * structurally parallel to the naive worker's.
 */
export interface NewEvaluatorOptionsForWorker {}

export interface WorkerInit {
  minHeartbeatInterval: { ms: number };
  samplingReportInterval: { ms: number };
}

export type InitializationResult =
  | "ok"
  | ["error", Error];
