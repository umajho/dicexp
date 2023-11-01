import type { Scope } from "@dicexp/runtime/scopes";

import { BatchHandler } from "./handler_batch";
import { Pulser } from "./heartbeat";
import {
  BatchReport,
  DataFromWorker,
  DataToWorker,
  EvaluationOptionsForWorker,
  WorkerInit,
} from "./types";
import { safe } from "./utils";
import { Evaluator } from "./evaluate";

declare function postMessage(data: DataFromWorker): void;

export class Server<AvailableScopes extends Record<string, Scope>> {
  init!: WorkerInit;
  pulser!: Pulser;

  evaluator: Evaluator<AvailableScopes>;
  batchHandler: BatchHandler<AvailableScopes> | null = null;

  constructor(
    public availableScopes: AvailableScopes,
  ) {
    this.evaluator = new Evaluator(availableScopes);
  }

  async handle(data: DataToWorker): Promise<void> {
    const dataToWorkerType = data[0];

    if (dataToWorkerType === "initialize") {
      if (this.init) {
        const error = new Error("Worker 重复初始化");
        this.tryPostMessage(["initialize_result", ["error", error]]);
        return;
      }
      this.init = data[1];
      this.pulser = new Pulser(this.init.minHeartbeatInterval, this);
      this.tryPostMessage(["initialize_result", "ok"]);
      return;
    } else if (!this.init) {
      console.error("Worker 尚未初始化！");
      return;
    }

    switch (dataToWorkerType) {
      case "evaluate":
      case "batch_start": {
        const id = data[1];
        const code = data[2], opts = data[3];
        if (dataToWorkerType === "evaluate") {
          this.tryPostMessage(this.handleEvaluateSingle(id, code, opts));
        } else {
          if (this.batchHandler) {
            const error = new Error("已在进行批量处理");
            const data: BatchReport = ["error", "other", error];
            this.tryPostMessage(["batch_report", id, data]);
          }
          const clear = () => this.batchHandler = null;
          this.batchHandler = new BatchHandler(id, code, opts, this, clear);
        }
        return;
      }
      case "batch_stop": {
        const id = data[1];
        if (!this.batchHandler) {
          console.warn("不存在批量处理");
          return;
        }
        this.batchHandler.handleBatchStop(id);
        return;
      }
      default:
        console.error(
          `收到来自外界的未知消息：「${JSON.stringify(dataToWorkerType)}」！`,
        );
    }
  }

  tryPostMessage(data: DataFromWorker): void {
    if (data[0] === "initialize_result" && data[1] !== "ok") {
      const result = data[1];
      data[1] = ["error", makeSendableError(result[1])];
    } else if (data[0] === "evaluate_result") {
      let result = data[2];
      if (
        result[0] === "error" &&
        (result[1] === "parse" || result[1] === "other")
      ) {
        data[2] = ["error", result[1], makeSendableError(result[2])];
      }
    } else if (data[0] === "batch_report") {
      let report = data[2];
      if (report[0] === "error") {
        const sendableErr = makeSendableError(report[2]);
        if (report[1] === "batch") {
          data[2] = ["error", "batch", sendableErr, report[3], report[4]];
        } else { // report[1] === "parse" || report[1] === "other"
          data[2] = ["error", report[1], sendableErr];
        }
      }
    }
    try {
      postMessage(data);
    } catch (e) {
      const errorMessage = (e instanceof Error) ? e.message : `${e}`;
      console.log(data);
      postMessage(["fatal", "无法发送消息：" + errorMessage]);
    }
  }

  handleEvaluateSingle(
    id: string,
    code: string,
    opts: EvaluationOptionsForWorker,
  ): DataFromWorker {
    let result = safe(() => this.evaluator.evaluate(code, opts));
    if (result[0] === "error" && typeof result[1] !== "string") {
      result = ["error", "other", result[1]];
    }
    return ["evaluate_result", id, result];
  }
}

function makeSendableError(
  err: { name?: string; message: string; stack?: string },
): Error {
  return { name: err.name ?? "Error", message: err.message, stack: err.stack };
}
