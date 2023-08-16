import { EvaluationResult } from "./evaluate";
import { BatchReport } from "./worker-builder/types";

export type EvaluationResultForWorker =
  | EvaluationResult
  | ["error", "worker_client", Error];

export type BatchReportForWorker =
  | BatchReport
  | ["error", "worker_client", Error];
