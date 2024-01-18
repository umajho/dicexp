import { DicexpEvaluatorProvider } from "@rotext/solid-components";

import DicexpEvaluatingWorker from "../workers/evaluation.worker?worker";

let Manager:
  | typeof import("@dicexp/naive-evaluator-in-worker/internal").EvaluatingWorkerManager
  | null = null;

export const defaultEvaluatorProvider = {
  default: (opts?: { readinessWatcher?: (ready: boolean) => void }) => {
    return new Promise(async (r) => {
      if (!Manager) {
        Manager = (await import(
          "@dicexp/naive-evaluator-in-worker/internal"
        )).EvaluatingWorkerManager;
      }
      let hasBeenReady = false;
      const manager: any = new Manager(
        () => new DicexpEvaluatingWorker(),
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
            topLevelScope: "standard",
            randomSourceMaker: "xorshift7",
          },
        },
      );
    });
  },
} satisfies DicexpEvaluatorProvider;
