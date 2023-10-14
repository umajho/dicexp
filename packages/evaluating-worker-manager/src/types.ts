import type { EvaluationResult } from "dicexp";
import { BatchReport } from "./worker-inner/types";

export type EvaluationResultForWorker =
  | EvaluationResult
  | ["error", "worker_client", Error];

export type BatchReportForWorker =
  | BatchReport
  | ["error", "worker_client", Error];
