import {
  BatchReportForWorker,
  EvaluationResultForWorker,
} from "@dicexp/evaluating-worker-manager/internal";

export type ResultRecord =
  | [type: "single", code: string, result: EvaluationResultForWorker]
  | [type: "batch", code: string, report: BatchReportForWorker]
  | [type: "error", error: Error];
