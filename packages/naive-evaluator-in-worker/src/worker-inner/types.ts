import type * as I from "@dicexp/interface";

import type {
  EvaluationResult,
  NewEvaluatorOptions,
} from "@dicexp/naive-evaluator/internal";

export type MessageToWorker = InitialMessageToWorker | MessageToServer;
export type InitialMessageToWorker = [type: "initialize", init: WorkerInit];
export type MessageToServer =
  | [type: "update_evaluator_options", opts: NewEvaluatorOptions]
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
    opts: I.EvaluationGenerationOptions,
  ]
  | [type: "sample_stop", id: string];

export type MessageFromWorker = InitialMessageFromWorker | MessageFromServer;
export type InitialMessageFromWorker =
  | [type: "loaded"]
  | [type: "initialize_result", result: InitializationResult];
export type MessageFromServer =
  | [type: "heartbeat"]
  | [type: "evaluate_result", id: string, result: EvaluationResult]
  | [type: "sampling_report", id: string, report: I.SamplingReport]
  | [type: "fatal", reason?: string];

export interface NewEvaluatorOptionsForWorker {
  randomSourceMaker: Extract<
    NewEvaluatorOptions["randomSourceMaker"],
    string
  >;
}

export interface WorkerInit {
  minHeartbeatInterval: { ms: number };
  samplingReportInterval: { ms: number };
}

export type InitializationResult =
  | "ok"
  | ["error", Error];
