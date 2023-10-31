import type { BasicEvaluationResult } from "@dicexp/interface";
import { BatchReport } from "./worker-inner/types";

export type EvaluationResultForWorker =
  | BasicEvaluationResult
  | ["error", "worker_client", Error];

export type BatchReportForWorker =
  | BatchReport
  | ["error", "worker_client", Error];
