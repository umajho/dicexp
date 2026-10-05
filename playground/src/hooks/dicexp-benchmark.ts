/**
 * Benchmark mode (nova/docs/roadmap.md v0.3): run one expression on BOTH
 * implementations over N seeds (0..N-1) via the worker sampling channels —
 * sequentially (naive first, then nova) for fair timing — and report
 * per-implementation timing/throughput plus exact result-histogram
 * agreement. The mode doubles as an interactive differential checker:
 * same seeds ⇒ identical histograms on the naive/nova-compatible subset
 * (see nova/docs/compat.md).
 *
 * This file defines the PUBLIC CONTRACT consumed by
 * `../components/main/benchmark-pane.tsx`. Keep the exported API stable.
 */
import type { Implementation } from "../types";

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

export type BenchmarkStatus =
  | "idle" // never started (or reset by starting again)
  | "preparing" // worker managers loading (first start only)
  | "running" // at least one run ahead of us
  | "done"; // finished, cancelled, or errored — see `outcome`

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

/**
 * Creates the benchmark controller. Owns its own pair of worker managers
 * (created lazily on the first `start()`, kept alive afterwards) so the
 * benchmark never interferes with the main evaluator's managers.
 */
export default function createDicexpBenchmark(opts: {
  code: () => string;
  sampleCount: () => number;
}): {
  status: () => BenchmarkStatus;
  /** Live-updating per-implementation run states (reactive). */
  runs: () => BenchmarkRunState[];
  /** The latest completed outcome (kept after done; replaced on restart). */
  outcome: () => BenchmarkOutcome | null;
  /** Code non-empty, sample count a positive integer, not currently running. */
  canStart: () => boolean;
  start: () => void;
  /** Stops the in-flight run (partial results are recorded); no-op otherwise. */
  cancel: () => void;
} {
  throw new Error("not implemented");
}
