import { errorAsErrorData } from "../error_from_worker";
import { BatchHandler } from "./handler_batch";
import { handleEvaluate } from "./handler_single";
import { Pulser } from "./heartbeat";
import { DataFromWorker, DataToWorker, WorkerInit } from "./types";

declare function postMessage(data: DataFromWorker): void;

export class Server {
  init!: WorkerInit;
  pulser!: Pulser;

  batchHandler: BatchHandler | null = null;

  async handle(data: DataToWorker): Promise<void> {
    const dataToWorkerType = data[0];

    if (dataToWorkerType === "initialize") {
      if (this.init) {
        const error = new Error("Worker 重复初始化");
        this.tryPostMessage(["initialize_result", {
          error: errorAsErrorData(error),
        }]);
        return;
      }
      this.init = data[1];
      this.pulser = new Pulser(this.init.minHeartbeatInterval, this);
      this.tryPostMessage(["initialize_result", { ok: true }]);
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
          this.tryPostMessage(handleEvaluate(id, code, opts));
        } else {
          if (this.batchHandler) {
            const error = new Error("已在进行批量处理");
            this.tryPostMessage(["batch_report", id, { error }, true, null]);
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
    if (data[0] === "evaluate_result") {
      if (data[2].error) {
        data[3] = errorAsErrorData(data[2].error);
        // @ts-ignore
        delete data[2].error;
      }
    } else if (data[0] === "batch_report") {
      if (data[2].error) {
        data[4] = errorAsErrorData(data[2].error);
        delete data[2].error;
      }
    }
    try {
      postMessage(data);
    } catch (e) {
      const errorMessage = (e instanceof Error) ? e.message : `${e}`;
      postMessage(["fatal", "无法发送消息：" + errorMessage]);
    }
  }
}
