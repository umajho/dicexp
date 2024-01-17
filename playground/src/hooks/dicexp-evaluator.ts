import { createSignal } from "solid-js";

import { DicexpEvaluation } from "@rotext/solid-components";

import { Unreachable } from "@dicexp/errors";
import {
  EvaluationGenerationOptions,
  ExecutionRestrictions,
  RemoteEvaluationLocalRestrictions,
  RemoteEvaluationOptions,
} from "@dicexp/interface";
import {
  EvaluatingWorkerManager,
} from "@dicexp/evaluating-worker-manager/internal";

import { evaluatorInfo, scopesInfo } from "../workers/evaluation-worker-info";

import { ResultRecord, SamplingReportForPlayground } from "../types";
import { defaultEvaluatorProvider } from "../stores/evaluator-provider";

export type Status = {
  type: "loading"; // worker manager 尚未完成加载
} | {
  type: "rolling"; // 正在掷骰
  mode: "single" | "sampling";
} | {
  type: "ready"; // 已准备好求值
} | {
  type: "invalid"; // 输入存在问题（为空）
};

export interface AllKindsOfnRestrictions {
  execution: ExecutionRestrictions;
  local: RemoteEvaluationLocalRestrictions;
}

export default function createDicexpEvaluator(
  code: () => string,
  opts: {
    mode: () => "single" | "sampling" | null;
    seed: () => number;
    isSeedFrozen: () => boolean;
    restrictions: () => AllKindsOfnRestrictions | null;
  },
) {
  const [loading, setLoading] = createSignal(true);
  const [workerManager, setWorkerManager] = createSignal<
    EvaluatingWorkerManager | null
  >(null);
  (async () => {
    setWorkerManager(
      await defaultEvaluatorProvider.default({
        readinessWatcher: (ready) => setLoading(!ready),
      }),
    );
  })();

  const isCodeValid = () => {
    if (code().trim() === "") return false;
    if (!opts.isSeedFrozen()) return true;
    return Number.isInteger(opts.seed());
  };

  const [isRolling, setIsRolling] = createSignal<false | "single" | "sampling">(
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
    setIsRolling(opts.mode()!);

    const code_ = code(),
      seed = opts.seed(),
      restrictions = opts.restrictions() ?? undefined;
    const date = new Date();
    // TODO: 更合理的方式是借由 manager 从 worker 中获取。
    const environment: NonNullable<DicexpEvaluation["environment"]> = [
      evaluatorInfo.nameWithVersion,
      JSON.stringify({ r: seed, s: scopesInfo.version }),
    ];

    switch (opts.mode()) {
      case "single": {
        try {
          // execution: restrictions?.execution ?? null,
          // local:  restrictions?.local ?? null,
          const evalOpts: RemoteEvaluationOptions = {
            execution: {
              seed: opts.seed(),
              ...(restrictions?.execution
                ? { restrictions: restrictions.execution }
                : {}),
            },
            local: {
              ...(restrictions?.local
                ? { restrictions: restrictions.local }
                : {}),
            },
          };
          const result = await workerManager()!.evaluateRemote(
            code_,
            evalOpts,
          );
          setResult({ type: "single", code: code_, result, date, environment });
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出：${e}`);
          }
          setResult({ type: "error", error: e as Error, date, environment });
        }
        break;
      }
      case "sampling": {
        try {
          const evalOpts: EvaluationGenerationOptions = {};
          const code = code_;
          const g = workerManager()!.keepSampling(code, evalOpts);
          const [report, setReport] = //
            createSignal<SamplingReportForPlayground>("preparing");
          setResult({ type: "sampling", code, report, date, environment });
          while (true) {
            const yielded = await g.next();
            setReport(yielded.value);
            if (yielded.done) break;
          }
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出：${e}`);
          }
          setResult({ type: "error", error: e as Error, date, environment });
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

  function stopSampling() {
    workerManager()!.stopSampling();
  }

  return { status, roll, result, terminate, stopSampling };
}
