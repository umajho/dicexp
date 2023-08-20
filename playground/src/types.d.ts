import { BatchReportForWorker, EvaluationResultForWorker } from "dicexp";

export type Result = {
  type: null;
} | {
  type: "single";
  result: EvaluationResultForWorker;
} | {
  type: "batch";
  report: BatchReportForWorker;
} | {
  type: "error";
  error: Error;
};
