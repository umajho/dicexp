import { BatchHandler } from "./handler_batch";
import { handleEvaluate } from "./handler_single";
import { Pulser } from "./heartbeat";
import { tryPostMessage } from "./post_message";
import { DataToWorker, WorkerInit } from "./types";

export class Server {
  batchHandler: BatchHandler | null = null;

  constructor(
    public init: WorkerInit,
    public pulser = new Pulser(init.minHeartbeatInterval),
  ) {}

  async handle(data: DataToWorker): Promise<void> {
    const dataToWorkerType = data[0];
    switch (dataToWorkerType) {
      case "evaluate":
      case "batch_start": {
        const id = data[1];
        const code = data[2], opts = data[3];
        if (dataToWorkerType === "evaluate") {
          tryPostMessage(handleEvaluate(id, code, opts));
        } else {
          if (this.batchHandler) {
            const error = new Error("已在进行批量处理");
            tryPostMessage(["batch_report", id, { error }, true, null]);
          }
          const clear = () => this.batchHandler = null;
          const init = this.init, pulser = this.pulser;
          this.batchHandler = new BatchHandler(
            id,
            code,
            opts,
            init,
            pulser,
            clear,
          );
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
}