import { createSignal } from "solid-js";

import DicexpEvaluatingWorker from "../workers/dicexp-evaluator?worker";

import { Unreachable } from "@dicexp/errors";
import {
  EvaluateOptionsForWorker,
  EvaluatingWorkerManager,
  EvaluationRestrictionsForWorker,
} from "@dicexp/evaluating-worker-manager/internal";
import { ResultRecord } from "../types";
import { scopesForRuntime } from "../stores/scopes";

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
    topLevelScopeName: () => keyof typeof scopesForRuntime;
  },
) {
  const [loading, setLoading] = createSignal(true);
  const [workerManager, setWorkerManager] = createSignal<
    EvaluatingWorkerManager<typeof scopesForRuntime> | null
  >(null);
  (async () => {
    const manager = await import("@dicexp/evaluating-worker-manager/internal");
    setWorkerManager(
      new manager.EvaluatingWorkerManager(
        () => new DicexpEvaluatingWorker(),
        (ready) => setLoading(!ready),
      ),
    );
  })();

  const isCodeValid = () => {
    if (code().trim() === "") return false;
    if (!opts.isSeedFrozen()) return true;
    return Number.isInteger(opts.seed());
  };

  const [isRolling, setIsRolling] = createSignal<false | "single" | "batch">(
    false,
  );
  const [result, setResult] = createSignal<ResultRecord | null>(null);

  const status = (): Status => {
    if (loading()) return { type: "loading" };

    const isRollingValue = isRolling();
    if (isRollingValue) return { type: "rolling", mode: isRollingValue };

    return { type: isCodeValid() ? "ready" : "invalid" };
  };

  async function roll() {
    if (status().type !== "ready") return;
    setResult(null);

    const code_ = code();
    setIsRolling(opts.mode()!);
    switch (opts.mode()) {
      case "single": {
        try {
          const evalOpts: EvaluateOptionsForWorker<typeof scopesForRuntime> = {
            execute: {
              topLevelScopeName: opts.topLevelScopeName() ?? "standard",
              seed: opts.seed(),
            },
            restrictions: opts.restrictions() ?? undefined,
          };
          const result = await workerManager()!.evaluate(
            code_,
            evalOpts,
          );
          setResult(["single", code_, result]);
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出：${e}`);
          }
          setResult(["error", e as Error]);
        }
        break;
      }
      case "batch": {
        try {
          const evalOpts: EvaluateOptionsForWorker<typeof scopesForRuntime> = {
            execute: {
              topLevelScopeName: opts.topLevelScopeName() ?? "standard",
              // seed 不生效
            },
            restrictions: opts.restrictions() ?? undefined,
          };
          await workerManager()!.batch(
            code_,
            evalOpts,
            (report) => setResult(["batch", code_, report]),
          );
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出：${e}`);
          }
          setResult(["error", e as Error]);
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
