import type * as I from "@dicexp/interface";
import { DicexpEvaluation } from "@rotext/solid-components";

export type SamplingReportForPlayground = I.SamplingReport | "preparing";

export type Implementation = "naive" | "nova";

/* The data types of the benchmark mode (see the `dicexp-benchmark` hook);
 * defined here (rather than there) because `ResultRecord` below carries
 * them in its `benchmark` variant, and the hook re-exports them. */

/** Final, worker-measured stats of one implementation's run. */
export interface BenchmarkRunFinal {
  /** Samples actually collected (equals the target unless cancelled/errored). */
  samples: number;
  /**
   * Wall time measured inside the worker (sampling start → stop), which
   * includes the one-time parse/compile of the sampling session.
   */
  elapsedMs: number;
  /** Exact result histogram over the sampled seeds (integer results only). */
  counts: Record<number, number>;
}

export interface BenchmarkRunState {
  implementation: Implementation;
  phase: "pending" | "running" | "done" | "error";
  /** Live progress while running (from the worker's interval reports). */
  samplesDone: number;
  elapsedMs: number;
  final: BenchmarkRunFinal | null;
  error: Error | null;
}

export interface BenchmarkOutcome {
  code: string;
  targetSamples: number;
  /** Final snapshot of both runs (naive first, then nova). */
  runs: BenchmarkRunState[];
  /**
   * Exact histogram equality between the two runs; `null` when not
   * comparable (a run errored, or was cancelled short of the target).
   */
  agreement: boolean | null;
  /** nova throughput / naive throughput; `null` unless both completed. */
  speedup: number | null;
}

export type ResultRecord =
  & (
    | {
      type: "single";
      code: string;
      result: I.EvaluationResult;
      implementation: Implementation;
    }
    | {
      type: "sampling";
      code: string;
      report: () => SamplingReportForPlayground;
      implementation: Implementation;
    }
    | { type: "error"; error: Error; implementation: Implementation }
    | {
      /** A completed benchmark run (covers both implementations at once). */
      type: "benchmark";
      code: string;
      outcome: BenchmarkOutcome;
    }
  )
  & {
    date: Date;
    environment?: NonNullable<DicexpEvaluation["environment"]>;
  };
