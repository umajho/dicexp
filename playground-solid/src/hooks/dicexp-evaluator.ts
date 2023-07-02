import { createSignal, untrack } from "solid-js";

import { Unreachable } from "@dicexp/errors";
import type {
  EvaluateOptionsForWorker,
  EvaluatingWorkerManager,
  EvaluationRestrictionsForWorker,
} from "dicexp/internal";
import { Result } from "../types";

export type Status = {
  type: "loading"; // worker manager 尚未完成加载
} | {
  type: "rolling"; // 正在掷骰
  mode: "single" | "batch";
} | {
  type: "ready"; // 已准备好求值
} | {
  type: "invalid"; // 输入存在问题（为空）
};

export default function createDicexpEvaluator(
  code: () => string,
  opts: {
    mode: () => "single" | "batch" | null;
    seed: () => number;
    isSeedFrozen: () => boolean;
    restrictions: () => EvaluationRestrictionsForWorker | null;
    topLevelScopeName: () =>
      EvaluateOptionsForWorker["execute"]["topLevelScopeName"];
  },
) {
  const [loading, setLoading] = createSignal(true);
  const [workerManager, setWorkerManager] = createSignal<
    EvaluatingWorkerManager | null
  >(null);
  (async () => {
    const dicexp = await import("dicexp/internal");
    setWorkerManager(
      new dicexp.EvaluatingWorkerManager((ready) => setLoading(!ready)),
    );
  })();

  const isCodeValid = () => {
    if (code().trim() === "") return false;
    if (!opts.isSeedFrozen()) return true;
    return Number.isInteger(opts.seed());
  };

  const [isRolling, setIsRolling] = createSignal(false);
  const [result, setResult] = createSignal<Result>({ type: null });

  const status = (): Status => {
    if (loading()) return { type: "loading" };
    if (isRolling()) return { type: "rolling", mode: opts.mode()! };
    if (isCodeValid()) return { type: "ready" };
    return { type: "invalid" };
  };

  async function roll() {
    if (status().type !== "ready") return;
    setResult({ type: null });

    setIsRolling(true);
    switch (opts.mode()) {
      case "single": {
        try {
          const evalOpts: EvaluateOptionsForWorker = {
            execute: {
              topLevelScopeName: opts.topLevelScopeName() ?? "standard",
              seed: opts.seed(),
            },
            restrictions: opts.restrictions() ?? undefined,
          };
          const result = await workerManager()!.evaluate(
            code(),
            evalOpts,
          );
          setResult({ type: "single", result });
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出：${e}`);
          }
          setResult({ type: "error", error: e });
        }
        break;
      }
      case "batch": {
        try {
          const evalOpts: EvaluateOptionsForWorker = {
            execute: {
              topLevelScopeName: opts.topLevelScopeName() ?? "standard",
              // seed 不生效
            },
            restrictions: opts.restrictions() ?? undefined,
          };
          await workerManager()!.batch(
            code(),
            evalOpts,
            (report) => setResult({ type: "batch", report }),
          );
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出：${e}`);
          }
          setResult({ type: "error", error: e });
        }
        break;
      }
      default:
        throw new Unreachable();
    }
    setIsRolling(false);
  }

  function terminate() {
    workerManager()!.terminateClient();
  }

  function stopBatching() {
    workerManager()!.stopBatching();
  }

  return { status, roll, result, terminate, stopBatching };
}
