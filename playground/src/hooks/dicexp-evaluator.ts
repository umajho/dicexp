import { createComputed, createSignal } from "solid-js";

import { DicexpEvaluation } from "@rotext/solid-components";

import { Unreachable } from "@dicexp/errors";
import type * as I from "@dicexp/interface";

import {
  evaluatorInfo,
  novaEvaluatorInfo,
  scopesInfo,
} from "../workers/evaluation-worker-info";

import {
  Implementation,
  ResultRecord,
  SamplingReportForPlayground,
} from "../types";
import {
  defaultEvaluatorProvider,
  novaEvaluatorProvider,
} from "../stores/evaluator-provider";

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
  execution: I.ExecutionRestrictions;
  local: I.RemoteEvaluationLocalRestrictions;
}

/**
 * The surface of a worker manager this hook relies on; both the naive and
 * the nova managers provide it (they implement `I.RemoteEvaluatorClient`
 * and `I.RemoteSamplerClient`, plus the terminate/stop controls).
 */
type AnyEvaluatingWorkerManager =
  & I.RemoteEvaluatorClient
  & I.RemoteSamplerClient
  & {
    terminateClient: () => void;
    stopSampling: () => void;
  };

export default function createDicexpEvaluator(
  code: () => string,
  opts: {
    mode: () => "single" | "sampling" | null;
    seed: () => number;
    isSeedFrozen: () => boolean;
    restrictions: () => AllKindsOfnRestrictions | null;
    implementation: () => Implementation;
  },
) {
  const [loading, setLoading] = createSignal(true);
  const [result, setResult] = createSignal<ResultRecord | null>(null);

  // One worker manager per implementation, created lazily at the
  // implementation's first selection and kept alive afterwards (switching
  // back reuses the existing manager). Init state is tracked per
  // implementation too: "pending" (still loading) becomes "ready" — or,
  // nova only, "init-failed" (loading is cleared; the real error is shown
  // in the result pane, and rolls fail with the manager's remembered
  // cause — see `onInitError` below).
  type ManagerState = "pending" | "ready" | "init-failed";
  const managers = new Map<Implementation, AnyEvaluatingWorkerManager>();
  const managerCreationStarted = new Set<Implementation>();
  const managerStates: Record<Implementation, ManagerState> = {
    naive: "pending",
    nova: "pending",
  };

  function ensureManager(implementation: Implementation) {
    if (managerCreationStarted.has(implementation)) return;
    managerCreationStarted.add(implementation);

    const readinessWatcher = (ready: boolean) => {
      managerStates[implementation] = ready ? "ready" : "pending";
      // `loading` reflects the readiness of the CURRENTLY selected
      // implementation.
      if (opts.implementation() === implementation) {
        setLoading(!ready);
      }
    };

    void (async () => {
      // Nova only: its manager retries a failed init a few times and then
      // reports the real cause through `onInitError` (the naive manager
      // has no init-error hook, so its provider — and path — stays
      // untouched; see `evaluator-provider.ts`).
      const manager = implementation === "naive"
        ? await defaultEvaluatorProvider.default({ readinessWatcher })
        : await novaEvaluatorProvider.default({
          readinessWatcher,
          onInitError: (error) => {
            managerStates[implementation] = "init-failed";
            if (opts.implementation() === implementation) {
              setLoading(false);
            }
            // Show the real error in the result pane right away — instead
            // of a forever-loading spinner. Later rolls keep surfacing
            // the same failure through the (permanently failed) manager.
            setResult({
              type: "error",
              error,
              date: new Date(),
              implementation,
            });
          },
        });
      managers.set(implementation, manager);
    })();
  }

  createComputed(() => {
    const implementation = opts.implementation();
    ensureManager(implementation);
    // Switching to a never-used implementation keeps `loading` true until
    // its worker is ready; switching back to a ready one clears it. An
    // implementation whose init failed for good is no longer loading —
    // its next roll surfaces the remembered error instead.
    setLoading(managerStates[implementation] === "pending");
  });

  const isCodeValid = () => {
    if (code().trim() === "") return false;
    if (!opts.isSeedFrozen()) return true;
    return Number.isInteger(opts.seed());
  };

  const [isRolling, setIsRolling] = createSignal<false | "single" | "sampling">(
    false,
  );

  const status = (): Status => {
    if (loading()) return { type: "loading" };

    const isRollingValue = isRolling();
    if (isRollingValue) return { type: "rolling", mode: isRollingValue };

    return { type: isCodeValid() ? "ready" : "invalid" };
  };

  async function roll() {
    if (status().type !== "ready") return;

    // Like `code_`: the implementation (and its manager) are captured at
    // roll time — switching implementations mid-roll does not reroute the
    // in-flight evaluation.
    const implementation = opts.implementation(),
      code_ = code(),
      seed = opts.seed(),
      restrictions = opts.restrictions() ?? undefined;
    const manager = managers.get(implementation);
    if (!manager) return; // caught mid-(re)initialization; not reachable in practice
    const date = new Date();
    // TODO: 更合理的方式是借由 manager 从 worker 中获取。
    const environment: NonNullable<DicexpEvaluation["environment"]> =
      implementation === "naive"
        ? [
          evaluatorInfo.nameWithVersion,
          JSON.stringify({ r: seed, s: scopesInfo.version }),
        ]
        : [
          novaEvaluatorInfo.nameWithVersion,
          JSON.stringify({ r: seed }),
        ];

    setResult(null);
    setIsRolling(opts.mode()!);

    switch (opts.mode()) {
      case "single": {
        try {
          // execution: restrictions?.execution ?? null,
          // local:  restrictions?.local ?? null,
          const evalOpts: I.RemoteEvaluationOptions = {
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
          const result = await manager.evaluateRemote(
            code_,
            evalOpts,
          );
          setResult({
            type: "single",
            code: code_,
            result,
            date,
            environment,
            implementation,
          });
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出：${e}`);
          }
          setResult({
            type: "error",
            error: e as Error,
            date,
            environment,
            implementation,
          });
        }
        break;
      }
      case "sampling": {
        try {
          const evalOpts: I.EvaluationGenerationOptions = {};
          const code = code_;
          const g = manager.keepSampling(code, evalOpts);
          const [report, setReport] = //
            createSignal<SamplingReportForPlayground>("preparing");
          setResult({
            type: "sampling",
            code,
            report,
            date,
            environment,
            implementation,
          });
          while (true) {
            const yielded = await g.next();
            setReport(yielded.value);
            if (yielded.done) break;
          }
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出：${e}`);
          }
          setResult({
            type: "error",
            error: e as Error,
            date,
            environment,
            implementation,
          });
        }
        break;
      }
      default:
        throw new Unreachable();
    }
    setIsRolling(false);
  }

  // Terminate and stop act on the manager of the implementation selected at
  // the time of the call (which may differ from a rolling evaluation's).
  function terminate() {
    managers.get(opts.implementation())?.terminateClient();
  }

  function stopSampling() {
    managers.get(opts.implementation())?.stopSampling();
  }

  return { status, roll, result, terminate, stopSampling };
}
