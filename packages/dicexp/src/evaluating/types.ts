import { EvaluationResult } from "./evaluate";
import { EvaluatingSpecialErrorType } from "./error_from_worker";
import { BatchReport } from "./worker-builder/types";

export type EvaluationResultForWorker = EvaluationResult & {
  specialErrorType?: EvaluatingSpecialErrorType;
};

export type BatchReportForWorker = BatchReport & {
  specialErrorType?: EvaluatingSpecialErrorType;
};
