import { asRuntimeError, type RuntimeError } from "@dicexp/executing";
import { parse } from "@dicexp/parsing";
import type { Node } from "@dicexp/nodes";
import type {
  BatchReport,
  EvaluateOptionsForWorker,
  ExecuteOptionsForWorker,
  WorkerInit,
} from "./types";
import { safe } from "./utils";
import { Pulser } from "./heartbeat";
import { tryPostMessage } from "./post_message";
import { executeForWorker } from "./evaluate";

export class BatchHandler {
  private readonly id!: string;
  private readonly report!: BatchReport; //Required<Omit<BatchReport, "error">>;
  private shouldStop!: boolean | Error | RuntimeError;

  private readonly init!: WorkerInit;
  private readonly pulser!: Pulser;

  private readonly stoppedCb!: () => void;

  constructor(
    id: string,
    code: string,
    opts: EvaluateOptionsForWorker,
    init: WorkerInit,
    pulser: Pulser,
    stoppedCb: () => void,
  ) {
    const parsed = safe(() => parse(code, opts.parse));
    if ("error" in parsed) {
      tryPostMessage(["batch_report", id, { error: parsed.error }, true, null]);
      stoppedCb();
      return;
    }

    this.id = id;
    const nowMs = Date.now();
    this.report = {
      ok: { samples: 0, counts: {} },
      statistics: { start: { ms: nowMs }, now: { ms: nowMs } },
      stopped: false,
    };
    this.shouldStop = false;

    this.init = init;
    this.pulser = pulser;
    this.stoppedCb = stoppedCb;

    this.initBatchReporter();

    this.samplingLoop(parsed.ok, opts.execute);
  }

  private initBatchReporter() {
    const intervalId = setInterval(() => {
      if (this.shouldStop) {
        this.report.stopped = true;
        if (this.shouldStop instanceof Error) {
          this.report.error = this.shouldStop;
        } else {
          const runtimeError = asRuntimeError(this.shouldStop);
          if (runtimeError) {
            this.report.error = new Error(
              "某次求值时遭遇运行时错误：" + runtimeError.message,
            );
          }
        }
        clearInterval(intervalId);
        this.stoppedCb();
      } else {
        // 尚未结束时的时间由这里更新，若已结束则在结束时更新，因为后者可能有延时
        this.report.statistics!.now.ms = Date.now();
      }
      const shouldStop = !!this.shouldStop;
      tryPostMessage(["batch_report", this.id, this.report, shouldStop, null]);
    }, this.init.batchReportInterval.ms);
  }

  private markBatchToStop(error?: Error | RuntimeError) {
    this.shouldStop = error ? error : true;
    this.report.statistics!.now.ms = Date.now();
  }

  private async samplingLoop(node: Node, executeOpts: ExecuteOptionsForWorker) {
    while (true) {
      const durationSinceLastHeartbeat = Date.now() - this.pulser.lastHeartbeat;
      if (durationSinceLastHeartbeat > this.init.minHeartbeatInterval.ms) {
        await new Promise((r) => setTimeout(r, 0)); // 交回控制权
      }
      if (this.shouldStop) break;

      const executed = safe(() => executeForWorker(node, executeOpts));
      if ("error" in executed) {
        this.markBatchToStop(executed.error);
        break;
      }

      const value = executed.ok;
      if (typeof value !== "number") { // TODO: 支持布尔值
        const error = new Error(
          `批量时不支持求值结果 "${JSON.stringify(value)}" 的类型`,
        );
        this.markBatchToStop(error);
        break;
      }

      this.report.ok!.samples++;
      const oldCount = this.report.ok!.counts[value] ?? 0;
      this.report.ok!.counts[value] = oldCount + 1;
    }
  }

  handleBatchStop(id: string) {
    if (this.id !== id) {
      console.warn(`Batch ID 不匹配：期待 ${id}，实际为 ${this.id}。`);
      return;
    }
    this.markBatchToStop();
  }
}
