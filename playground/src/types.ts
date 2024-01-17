import { EvaluationResult, SamplingReport } from "@dicexp/interface";
import { DicexpEvaluation } from "@rotext/solid-components";

export type BatchReportForPlayground = SamplingReport | "preparing";

export type ResultRecord =
  & (
    | { type: "single"; code: string; result: EvaluationResult }
    | { type: "batch"; code: string; report: () => BatchReportForPlayground }
    | { type: "error"; error: Error }
  )
  & {
    date: Date;
    environment?: NonNullable<DicexpEvaluation["environment"]>;
  };
