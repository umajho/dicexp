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
 *
 * Driving notes (see the sibling `dicexp-evaluator.ts` hook and
 * `I.RemoteSamplerClient`): `manager.keepSampling(code,
 * { sampling: { maxSamples } })` returns an async generator that YIELDS
 * `["continue", result, statis]` interval reports; the FINAL report —
 * `["stop", result, statis]` or an `["error", …]` report — is the
 * generator's *return* value, i.e. the `value` of the `next()` result
 * whose `done` is `true`. Cancelling a run goes through the manager's
 * `stopSampling()`, after which the worker posts a final (possibly
 * partial) "stop" report.
 */
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

import type * as I from "@dicexp/interface";

import type { Implementation } from "../types";
import {
  defaultEvaluatorProvider,
  novaEvaluatorProvider,
} from "../stores/evaluator-provider";

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
 * The surface of a worker manager this hook relies on; both the naive and
 * the nova managers provide it (they implement `I.RemoteSamplerClient`,
 * plus the stop control).
 */
type AnyEvaluatingWorkerManager = I.RemoteSamplerClient & {
  stopSampling: () => void;
};

/**
 * What `keepSampling`'s generator ultimately *returns* (never yields):
 * the final "stop" or "error" report of a sampling run.
 */
type FinalSamplingReport =
  | I.SamplingOkReport<"stop">
  | I.SamplingErrorReport;

/**
 * Fixed run order (store index 0 = naive, 1 = nova): naive first, then
 * nova, strictly sequentially so the two workers never compete for CPU
 * while being timed.
 */
const RUN_IMPLEMENTATIONS = ["naive", "nova"] as const;

function initialRunState(implementation: Implementation): BenchmarkRunState {
  return {
    implementation,
    phase: "pending",
    samplesDone: 0,
    elapsedMs: 0,
    final: null,
    error: null,
  };
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
  const [status, setStatus] = createSignal<BenchmarkStatus>("idle");
  const [outcome, setOutcome] = createSignal<BenchmarkOutcome | null>(null);
  // Index 0 = naive, 1 = nova (see `RUN_IMPLEMENTATIONS`).
  const [runs, setRuns] = createStore<BenchmarkRunState[]>([
    initialRunState("naive"),
    initialRunState("nova"),
  ]);

  // One manager per implementation, created together on the first
  // `start()` and kept alive for the hook's (i.e. the page's) lifetime —
  // like the sibling evaluator hook, this one never disposes its managers.
  const managers = new Map<Implementation, AnyEvaluatingWorkerManager>();
  let managersCreation: Promise<void> | null = null;

  // Set by `cancel()` — also mid-preparation; the driver checks it before
  // every run and skips everything that remains. Reset by `start()`.
  // Doubling as the re-entrancy guard: a second `cancel()` is a no-op.
  let cancelRequested = false;
  // The implementation whose sampling generator is currently in flight
  // (`null` while preparing / between runs / idle). Tells `cancel()` whose
  // manager to stop.
  let currentRun: Implementation | null = null;

  function canStart(): boolean {
    const statusValue = status();
    if (statusValue !== "idle" && statusValue !== "done") return false;
    const sampleCount = opts.sampleCount();
    if (!Number.isInteger(sampleCount) || sampleCount <= 0) return false;
    return opts.code().trim() !== "";
  }

  /**
   * Creates both managers (once, together — both workers load in parallel)
   * and resolves only once BOTH are ready.
   */
  function ensureManagers(): Promise<void> {
    if (!managersCreation) {
      managersCreation = (async () => {
        const [naiveManager, novaManager] = await Promise.all([
          defaultEvaluatorProvider.default(),
          novaEvaluatorProvider.default(),
        ]);
        managers.set("naive", naiveManager);
        managers.set("nova", novaManager);
      })();
    }
    return managersCreation;
  }

  function start() {
    if (!canStart()) return;

    const code_ = opts.code();
    const targetSamples = opts.sampleCount();

    cancelRequested = false;
    currentRun = null;
    for (const [index, implementation] of RUN_IMPLEMENTATIONS.entries()) {
      setRuns(index, initialRunState(implementation));
    }
    setOutcome(null);

    // If the managers already exist (an earlier `start()` created them),
    // skip the "preparing" phase and begin running right away.
    const managersExist = managers.size === RUN_IMPLEMENTATIONS.length;
    const managersReady = ensureManagers();
    setStatus(managersExist ? "running" : "preparing");
    void driveBenchmark(managersReady, code_, targetSamples);
  }

  function cancel() {
    const statusValue = status();
    if (statusValue !== "preparing" && statusValue !== "running") return;
    if (cancelRequested) return; // a cancellation is already in flight
    cancelRequested = true;

    const runImplementation = currentRun;
    if (runImplementation === null) {
      // Preparing (or momentarily between runs): no generator to stop —
      // the driver aborts by itself once it regains control.
      return;
    }
    // Ask the current implementation's worker to stop; its in-flight
    // generator will then return the final (possibly partial) report,
    // which `driveRun` records before the remaining runs are skipped.
    try {
      managers.get(runImplementation)?.stopSampling();
    } catch {
      // Defensive: e.g. the manager's client is (re)initializing. The flag
      // set above still winds the benchmark down once control returns to
      // the driver.
    }
  }

  async function driveBenchmark(
    managersReady: Promise<void>,
    code_: string,
    targetSamples: number,
  ) {
    try {
      await managersReady;
      if (!cancelRequested) setStatus("running");
      for (const [index, implementation] of RUN_IMPLEMENTATIONS.entries()) {
        // Cancelled: leave every remaining run at "pending".
        if (cancelRequested) break;
        await driveRun(index, implementation, code_, targetSamples);
      }
    } finally {
      // Reached in ALL endings — full completion, cancellation, or
      // all-runs-errored.
      finish(code_, targetSamples);
    }
  }

  async function driveRun(
    index: number,
    implementation: Implementation,
    code_: string,
    targetSamples: number,
  ) {
    setRuns(index, { phase: "running" });
    currentRun = implementation;
    try {
      // Both managers are stored before `managersReady` resolves, so this
      // cannot miss (the `!` is for the type-checker only).
      const manager = managers.get(implementation)!;
      const g = manager.keepSampling(code_, {
        sampling: { maxSamples: targetSamples },
      });
      while (true) {
        const { done, value } = await g.next();
        // The generator only ever *yields* "continue" reports; the final
        // "stop"/"error" report is its *return* value (`done === true`).
        // (A protocol-violating final report arriving as a yield would be
        // treated as the end of the run as well.)
        if (!done && value[0] === "continue") {
          const report = value as I.SamplingOkReport<"continue">;
          setRuns(index, {
            samplesDone: report[1].samples,
            elapsedMs: report[2]
              ? report[2].now.ms - report[2].start.ms
              : 0,
          });
          continue;
        }
        recordFinalReport(index, value as FinalSamplingReport);
        return;
      }
    } catch (e) {
      // E.g. the manager's client is mid-(re)initialization (a watchdog
      // restart), or something non-Error was thrown (`未知抛出`).
      // The error is shown per-implementation; the next one still runs.
      setRuns(index, {
        phase: "error",
        error: e instanceof Error ? e : new Error(`未知抛出：${e}`),
      });
    } finally {
      currentRun = null;
    }
  }

  function recordFinalReport(index: number, report: FinalSamplingReport) {
    if (report[0] === "stop") {
      const [, result, statis] = report;
      // A "stop" report's statistic is always present (the worker sets it
      // before sampling begins); the fallback only satisfies the type.
      const elapsedMs = statis ? statis.now.ms - statis.start.ms : 0;
      setRuns(index, {
        phase: "done",
        samplesDone: result.samples,
        elapsedMs,
        final: {
          samples: result.samples,
          elapsedMs,
          counts: result.counts,
        },
      });
      return;
    }

    // report[0] === "error"
    if (report[1] === "sampling") {
      const [, , err, result, statis] = report;
      setRuns(index, {
        phase: "error",
        samplesDone: result.samples,
        elapsedMs: statis ? statis.now.ms - statis.start.ms : 0,
        error: err,
      });
    } else if (report[1] === "parse") {
      const [, , parseError] = report;
      setRuns(index, {
        phase: "error",
        error: new Error(`解析错误：${parseError.message}`),
      });
    } else { // "other"
      const [, , err] = report;
      setRuns(index, { phase: "error", error: err });
    }
  }

  function finish(code_: string, targetSamples: number) {
    const [naiveRun, novaRun] = snapshotRuns();
    // `outcome` before `status`, so reactions to "done" see it in place.
    setOutcome({
      code: code_,
      targetSamples,
      runs: [naiveRun, novaRun],
      agreement: computeAgreement(naiveRun, novaRun, targetSamples),
      speedup: computeSpeedup(naiveRun, novaRun),
    });
    setStatus("done");
  }

  /**
   * Plain deep copies of the run states, so later `start()` resets can
   * never mutate a past outcome.
   */
  function snapshotRuns(): [BenchmarkRunState, BenchmarkRunState] {
    // The store always holds exactly two runs (index 0 = naive, 1 = nova).
    return [snapshotRun(runs[0]!), snapshotRun(runs[1]!)];
  }

  function snapshotRun(run: BenchmarkRunState): BenchmarkRunState {
    return {
      implementation: run.implementation,
      phase: run.phase,
      samplesDone: run.samplesDone,
      elapsedMs: run.elapsedMs,
      final: run.final === null
        ? null
        : {
          samples: run.final.samples,
          elapsedMs: run.final.elapsedMs,
          counts: { ...run.final.counts },
        },
      error: run.error,
    };
  }

  /**
   * `true` iff both runs completed the full sample count with exactly
   * equal result histograms; `false` iff both completed the full count but
   * the histograms differ; `null` when not comparable (errored, partial,
   * or skipped runs).
   */
  function computeAgreement(
    naiveRun: BenchmarkRunState,
    novaRun: BenchmarkRunState,
    targetSamples: number,
  ): boolean | null {
    if (naiveRun.phase !== "done" || novaRun.phase !== "done") return null;
    const naiveFinal = naiveRun.final, novaFinal = novaRun.final;
    if (!naiveFinal || !novaFinal) return null; // (implied by phase "done")
    if (
      naiveFinal.samples !== targetSamples ||
      novaFinal.samples !== targetSamples
    ) {
      return null; // cancelled (or otherwise) short of the target
    }
    const naiveCounts = naiveFinal.counts, novaCounts = novaFinal.counts;
    // Histogram keys are the string forms of the integer results.
    const keys = Object.keys(naiveCounts);
    if (keys.length !== Object.keys(novaCounts).length) return false;
    for (const key of keys) {
      if (naiveCounts[Number(key)] !== novaCounts[Number(key)]) return false;
    }
    return true;
  }

  function computeSpeedup(
    naiveRun: BenchmarkRunState,
    novaRun: BenchmarkRunState,
  ): number | null {
    if (naiveRun.phase !== "done" || novaRun.phase !== "done") return null;
    const naiveFinal = naiveRun.final, novaFinal = novaRun.final;
    if (!naiveFinal || !novaFinal) return null; // (implied by phase "done")
    if (naiveFinal.elapsedMs <= 0 || novaFinal.elapsedMs <= 0) return null;
    const naiveThroughput = naiveFinal.samples /
      (naiveFinal.elapsedMs / 1000);
    const novaThroughput = novaFinal.samples / (novaFinal.elapsedMs / 1000);
    return novaThroughput / naiveThroughput;
  }

  return { status, runs: () => runs, outcome, canStart, start, cancel };
}
