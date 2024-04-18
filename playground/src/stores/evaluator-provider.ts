import { DicexpEvaluatorProvider } from "@rotext/solid-components";

import NaiveEvaluatorWorker from "../workers/evaluation.worker?worker";

let NaiveEvaluatorWorkerManager:
  | typeof import("@dicexp/naive-evaluator-in-worker/internal").EvaluatingWorkerManager
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
