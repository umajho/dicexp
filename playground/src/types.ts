import {
  BatchReportForWorker,
  EvaluationResultForWorker,
} from "@dicexp/evaluating-worker-manager/internal";
import { DicexpEvaluation } from "@rotext/solid-components";

export type BatchReportForPlayground = BatchReportForWorker | "preparing";

export type ResultRecord =
  & (
    | { type: "single"; code: string; result: EvaluationResultForWorker }
    | { type: "batch"; code: string; report: () => BatchReportForPlayground }
    | { type: "error"; error: Error }
  )
  & {
    date: Date;
    environment?: NonNullable<DicexpEvaluation["environment"]>;
  };
