import type * as I from "@dicexp/interface";
import { DicexpEvaluation } from "@rotext/solid-components";

export type SamplingReportForPlayground = I.SamplingReport | "preparing";

export type ResultRecord =
  & (
    | { type: "single"; code: string; result: I.EvaluationResult }
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
