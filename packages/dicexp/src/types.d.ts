import type { EvaluationResult } from "./evaluate";
import type { EvaluatingSpecialErrorType } from "./error_from_worker";
import type { BatchReport } from "./worker/types";

export type EvaluationResultForWorker = EvaluationResult & {
  specialErrorType?: EvaluatingSpecialErrorType;
};

export type BatchReportForWorker = BatchReport & {
  specialErrorType?: EvaluatingSpecialErrorType;
};
