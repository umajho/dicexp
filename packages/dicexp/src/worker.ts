import { evaluate, EvaluateOptions, EvaluationResult } from "./evaluate";
import type { DataFromWorker, DataToWorker } from "./wokre_types";
import { getEvaluatingErrorType } from "./worker_data";

declare function postMessage(data: DataFromWorker): void;

let initialized = false;

async function handle(data: DataToWorker): Promise<DataFromWorker | null> {
  switch (data[0]) {
    case "initialize": {
      if (initialized) {
        const error = new Error("Worker 重复初始化");
        return ["initialize_result", { error }];
      }
      const init = data[1];
      const pulse = () => {
        postHeartbeat();
        setTimeout(pulse, init.minHeartbeatInterval.ms);
      };
      pulse();
      initialized = true;
      return ["initialize_result", { ok: true }];
    }
    case "evaluate": {
      const id = data[1];
      if (!initialized) {
        const error = new Error("Worker 尚未初始化");
        return ["evaluate_result", id, { error }, null];
      }
      const code = data[2], opts = data[3];
      const result = await evaluateSafe(code, opts);
      delete result.representation; // FIXME
      const specialErrorType = getEvaluatingErrorType(result.error);
      if (specialErrorType) {
        result.error = new Error(result.error!.message);
      }
      return ["evaluate_result", id, result, specialErrorType];
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

function postHeartbeat() {
  postMessage(["heartbeat"]);
}

async function evaluateSafe(
  code: string,
  opts?: EvaluateOptions,
): Promise<EvaluationResult> {
  try {
    return evaluate(code, opts);
  } catch (e) {
    if (!(e instanceof Error)) {
      e = new Error(`未知抛出：${e}`);
    }
    return { error: e as Error };
  }
}
