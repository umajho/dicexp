import { DicexpEvaluatorProvider } from "@rotext/solid-components";

import NaiveEvaluatorWorker from "../workers/evaluation.worker?worker";
import NovaEvaluationWorker from "../workers/nova-evaluation.worker?worker";

let NaiveEvaluatorWorkerManager:
  | typeof import("@dicexp/naive-evaluator-in-worker/internal").EvaluatingWorkerManager
  | null = null;

let NovaEvaluatorWorkerManager:
  | typeof import("@dicexp/nova-in-worker/internal").EvaluatingWorkerManager
  | null = null;

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
  default: (opts?: { readinessWatcher?: (ready: boolean) => void }) => {
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
            r(manager);
          }
          if (opts?.readinessWatcher) {
            opts.readinessWatcher(ready);
          }
        },
        // Nova's evaluator options are an (empty) reserved struct — its RNG
        // and scope are built in; see `nova/docs/plan.md` §7.1.
        { newEvaluatorOptions: {} },
      );
    });
  },
} satisfies DicexpEvaluatorProvider;
