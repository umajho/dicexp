import { EvaluationResult, SamplingReport } from "@dicexp/interface";
import { DicexpEvaluation } from "@rotext/solid-components";

export type SamplingReportForPlayground = SamplingReport | "preparing";

export type ResultRecord =
  & (
    | { type: "single"; code: string; result: EvaluationResult }
    | {
      type: "sampling";
      code: string;
      report: () => SamplingReportForPlayground;
    }
    | { type: "error"; error: Error }
  )
  & {
    date: Date;
    environment?: NonNullable<DicexpEvaluation["environment"]>;
  };
