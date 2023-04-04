import { execute } from "@dicexp/executing";
import { parse } from "@dicexp/parsing";
import { evaluate, EvaluateOptions } from "./evaluate";
import type {
  BatchReport,
  DataFromWorker,
  DataToWorker,
  WorkerInit,
} from "./wokre_types";
import { getEvaluatingErrorType } from "./worker_data";

declare function postMessage(data: DataFromWorker): void;

let initialized = false;
let init!: WorkerInit;

async function handle(data: DataToWorker): Promise<DataFromWorker | null> {
  const dataInType = data[0];
  switch (dataInType) {
    case "initialize": {
      if (initialized) {
        const error = new Error("Worker 重复初始化");
        return ["initialize_result", { error }];
      }
      init = data[1];
      initPulse(init.minHeartbeatInterval);
      initialized = true;
      return ["initialize_result", { ok: true }];
    }
    case "evaluate":
    case "batch_start": {
      const id = data[1];
      if (!initialized) {
        const error = new Error("Worker 尚未初始化");
        if (dataInType === "evaluate") {
          return ["evaluate_result", id, { error }, null];
        } else {
          return ["batch_report", id, { error }, true];
        }
      }
      const code = data[2], opts = data[3];
      if (dataInType === "evaluate") {
        return handleEvaluate(id, code, opts);
      } else {
        return handleBatchStart(id, code, opts);
      }
    }
    case "batch_stop": {
      const id = data[1];
      handleBatchStop(id);
      return null;
    }
    default:
      console.error("Unreachable!");
      return null;
  }
}

onmessage = (ev) => {
  const data = ev.data as DataToWorker;
  (async () => {
    const result = await handle(data);
    if (result) {
      postMessage(result);
    }
  })();
};

let lastHeardbeat!: number;

function initPulse(interval: { ms: number }) {
  const pulse = () => {
    postHeartbeat();
    lastHeardbeat = Date.now();
    setTimeout(pulse, interval.ms);
  };
  pulse();
}

function postHeartbeat() {
  postMessage(["heartbeat"]);
}

function handleEvaluate(
  id: string,
  code: string,
  opts?: EvaluateOptions,
): DataFromWorker {
  const result = safe(() => evaluate(code, opts));
  const specialErrorType = getEvaluatingErrorType(result.error);
  if (specialErrorType) {
    result.error = new Error(result.error!.message);
  }
  return ["evaluate_result", id, result, specialErrorType];
}

let batchState:
  | { name: "idle" }
  | {
    name: "batching";
    id: string;
    report: Required<Omit<BatchReport, "error">>;
    shouldStop: boolean | Error;
  } = { name: "idle" };

function handleBatchStart(
  id: string,
  code: string,
  opts?: EvaluateOptions,
): DataFromWorker | null {
  if (batchState.name !== "idle") {
    return ["batch_report", id, { error: new Error("已存在批量任务") }, true];
  }

  const parsed = safe(() => parse(code, opts?.parseOpts));
  if ("error" in parsed) {
    return ["batch_report", id, { error: parsed.error }, true];
  }

  (async () => {
    const now = { ms: Date.now() };
    batchState = {
      name: "batching",
      id,
      report: {
        ok: { samples: 0, counts: {} },
        statistics: { start: { ...now }, now },
      },
      shouldStop: false,
    };

    initBatchReporter(init.batchReportInterval);

    while (batchState.name === "batching" && !batchState.shouldStop) {
      const executed = safe(() => execute(parsed.ok));
      if ("error" in executed) {
        markBatchToStop(executed.error);
        continue;
      }
      const value = executed.ok;
      if (typeof value !== "number") { // TODO: 支持布尔值
        const error = new Error(
          `批量时不支持求值结果 "${JSON.stringify(value)}" 的类型`,
        );
        markBatchToStop(error);
        continue;
      }
      batchState.report.ok.samples++;
      const oldCount = batchState.report.ok.counts[value] ?? 0;
      batchState.report.ok.counts[value] = oldCount + 1;

      if (Date.now() - lastHeardbeat > init.minHeartbeatInterval.ms) {
        await new Promise((r) => setTimeout(r, 0)); // 交回控制权
      }
    }
  })();

  return null;
}

function initBatchReporter(interval: { ms: number }) {
  const intervalId = setInterval(() => {
    if (batchState.name === "idle") {
      console.warn("批量状态为空闲。");
      clearInterval(intervalId);
      return;
    }
    const stateCopy = batchState;
    const report: BatchReport = stateCopy.report;
    if (stateCopy.name === "batching" && stateCopy.shouldStop) {
      if (stateCopy.shouldStop instanceof Error) {
        report.error = stateCopy.shouldStop;
      }
      batchState = { name: "idle" };
      clearInterval(intervalId);
    } else {
      // 尚未结束时的时间由这里更新，若已结束则在结束时更新，因为后者可能有延时
      stateCopy.report.statistics.now.ms = Date.now();
    }
    postMessage(["batch_report", stateCopy.id, report, !!stateCopy.shouldStop]);
  }, interval.ms);
}

function markBatchToStop(error?: Error) {
  if (batchState.name === "idle") {
    console.warn("批量状态为空闲。");
    return;
  }
  batchState.shouldStop = error ? error : true;
  batchState.report.statistics.now.ms = Date.now();
}

function handleBatchStop(id: string) {
  if (batchState.name === "idle") {
    console.warn("未有批量任务。");
    return;
  } else if (batchState.id !== id) {
    console.warn(`Batch ID 不匹配：期待 ${id}，实际为 ${batchState.id}。`);
    return;
  }
  markBatchToStop();
}

function safe<T extends ({ error: Error } | {})>(cb: () => T) {
  try {
    return cb();
  } catch (e) {
    if (!(e instanceof Error)) {
      e = new Error(`未知抛出：${e}`);
    }
    return { error: e as Error };
  }
}
