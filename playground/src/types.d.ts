import type { BatchReport, EvaluationResult } from "dicexp/internal";

export type Result = {
  type: null;
} | {
  type: "single";
  result: EvaluationResult;
} | {
  type: "batch";
  report: BatchReport;
} | {
  type: "error";
  error: Error;
};
