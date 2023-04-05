import { execute } from "@dicexp/executing";
import { parse } from "@dicexp/parsing";
import type { Node } from "@dicexp/nodes";
import { EvaluateOptions } from "../evaluate";
import { BatchReport, WorkerInit } from "./types";
import { safe } from "./utils";
import { Pulser } from "./heartbeat";
import { tryPostMessage } from "./post_message";

export class BatchHandler {
  private readonly id!: string;
  private readonly report!: BatchReport; //Required<Omit<BatchReport, "error">>;
  private shouldStop!: boolean | Error;

  private readonly init!: WorkerInit;
  private readonly pulser!: Pulser;

  private readonly stoppedCb!: () => void;

  constructor(
    id: string,
    code: string,
    opts: EvaluateOptions | undefined,
    init: WorkerInit,
    pulser: Pulser,
    stoppedCb: () => void,
  ) {
    const parsed = safe(() => parse(code, opts?.parseOpts));
    if ("error" in parsed) {
      tryPostMessage(["batch_report", id, { error: parsed.error }, true]);
      stoppedCb();
      return;
    }

    this.id = id;
    const nowMs = Date.now();
    this.report = {
      ok: { samples: 0, counts: {} },
      statistics: { start: { ms: nowMs }, now: { ms: nowMs } },
    };
    this.shouldStop = false;

    this.init = init;
    this.pulser = pulser;
    this.stoppedCb = stoppedCb;

    this.initBatchReporter();

    this.samplingLoop(parsed.ok);
  }

  private initBatchReporter() {
    const intervalId = setInterval(() => {
      if (this.shouldStop) {
        if (this.shouldStop instanceof Error) {
          this.report.error = this.shouldStop;
        }
        clearInterval(intervalId);
        this.stoppedCb();
      } else {
        // 尚未结束时的时间由这里更新，若已结束则在结束时更新，因为后者可能有延时
        this.report.statistics!.now.ms = Date.now();
      }
      tryPostMessage(["batch_report", this.id, this.report, !!this.shouldStop]);
    }, this.init.batchReportInterval.ms);
  }

  private markBatchToStop(error?: Error) {
    this.shouldStop = error ? error : true;
    this.report.statistics!.now.ms = Date.now();
  }

  private async samplingLoop(node: Node) {
    while (true) {
      const durationSinceLastHeartbeat = Date.now() - this.pulser.lastHeartbeat;
      if (durationSinceLastHeartbeat > this.init.minHeartbeatInterval.ms) {
        await new Promise((r) => setTimeout(r, 0)); // 交回控制权
      }
      if (this.shouldStop) break;

      const executed = safe(() => execute(node));
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
