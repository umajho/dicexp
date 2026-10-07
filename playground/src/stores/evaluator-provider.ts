import { DicexpEvaluatorProvider } from "@rotext/solid-components";

import NaiveEvaluatorWorker from "../workers/evaluation.worker?worker";
import NovaEvaluationWorker from "../workers/nova-evaluation.worker?worker";

let NaiveEvaluatorWorkerManager:
  | typeof import("@dicexp/naive-evaluator-in-worker/internal").EvaluatingWorkerManager
  | null = null;

let NovaEvaluatorWorkerManager:
  | typeof import("@dicexp/nova-in-worker/internal").EvaluatingWorkerManager
  | null = null;

/** Options for `novaEvaluatorProvider.default` (naive's take only `readinessWatcher`). */
export interface NovaEvaluatorProviderOptions {
  readinessWatcher?: (ready: boolean) => void;
  /**
   * Forwards to the nova manager's `onInitError` (see
   * `NewEvaluatingWorkerManagerOptions`): invoked once, with the real
   * error, after the manager's init failed for good (the initial attempt
   * plus all bounded retries). The naive manager has no such hook, so its
   * provider simply does not take this option.
   */
  onInitError?: (error: Error) => void;
}

export const defaultEvaluatorProvider = {
  default: (opts?: { readinessWatcher?: (ready: boolean) => void }) => {
    return new Promise(async (r) => {
      if (!NaiveEvaluatorWorkerManager) {
        NaiveEvaluatorWorkerManager = (await import(
          "@dicexp/naive-evaluator-in-worker/internal"
        )).EvaluatingWorkerManager;
      }
      let hasBeenReady = false;
      const manager: any = new NaiveEvaluatorWorkerManager(
        () => new NaiveEvaluatorWorker(),
        (ready) => {
          if (ready && !hasBeenReady) {
            r(manager);
          }
          if (opts?.readinessWatcher) {
            opts.readinessWatcher(ready);
          }
        },
        {
          newEvaluatorOptions: {
            randomSourceMaker: "xorshift7",
          },
        },
      );
    });
  },
} satisfies DicexpEvaluatorProvider;

export const novaEvaluatorProvider = {
  default: (opts?: NovaEvaluatorProviderOptions) => {
    return new Promise(async (r) => {
      if (!NovaEvaluatorWorkerManager) {
        NovaEvaluatorWorkerManager = (await import(
          "@dicexp/nova-in-worker/internal"
        )).EvaluatingWorkerManager;
      }
      let hasBeenReady = false;
      const manager: any = new NovaEvaluatorWorkerManager(
        () => new NovaEvaluationWorker(),
        (ready) => {
          if (ready && !hasBeenReady) {
            hasBeenReady = true;
            r(manager);
          }
          if (opts?.readinessWatcher) {
            opts.readinessWatcher(ready);
          }
        },
        // Nova's evaluator options are an (empty) reserved struct — its RNG
        // and scope are built in; see `nova/docs/plan.md` §7.1.
        {
          newEvaluatorOptions: {},
          onInitError: (error) => {
            // Resolve with the (permanently failed) manager as well: its
            // `evaluateRemote`/`keepSampling` reject with the real cause,
            // so later rolls surface the init failure instead of
            // silently no-oping on a missing manager.
            if (!hasBeenReady) {
              r(manager);
            }
            opts?.onInitError?.(error);
          },
        },
      );
    });
  },
} satisfies DicexpEvaluatorProvider;
