import {
  EvaluationGenerationOptions,
  EvaluationOptions,
  SamplingReport,
} from "@dicexp/interface";

import type { EvaluationResult, NewEvaluatorOptions } from "dicexp/internal";

export type MessageToWorker = InitialMessageToWorker | MessageToServer;
export type InitialMessageToWorker = [type: "initialize", init: WorkerInit];
export type MessageToServer =
  | [type: "update_evaluator_options", opts: NewEvaluatorOptions]
  | [
    type: "evaluate",
    id: string,
    code: string,
    newEvaluatorOpts: NewEvaluatorOptionsForWorker,
    opts: EvaluationOptions,
  ]
  | [
    type: "sample_start",
    id: string,
    code: string,
    newEvaluatorOpts: NewEvaluatorOptionsForWorker,
    opts: EvaluationGenerationOptions,
  ]
  | [type: "sample_stop", id: string];

export type MessageFromWorker = InitialMessageFromWorker | MessageFromServer;
export type InitialMessageFromWorker =
  | [type: "loaded"]
  | [type: "initialize_result", result: InitializationResult];
export type MessageFromServer =
  | [type: "heartbeat"]
  | [type: "evaluate_result", id: string, result: EvaluationResult]
  | [type: "sampling_report", id: string, report: SamplingReport]
  | [type: "fatal", reason?: string];

export interface NewEvaluatorOptionsForWorker {
  topLevelScope: string;
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
