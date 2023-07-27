import { Node } from "@dicexp/nodes";
import { Scope } from "@dicexp/runtime/values";

import { asRuntimeError, RuntimeError } from "../../executing/mod";
import { parse } from "../../parsing/mod";
import { BatchReport, EvaluateOptionsForWorker } from "./types";
import { safe } from "./utils";
import { Server } from "./server";

export class BatchHandler<AvailableScopes extends Record<string, Scope>> {
  private readonly id!: string;
  private readonly report!: BatchReport; //Required<Omit<BatchReport, "error">>;
  private shouldStop!: boolean | Error | RuntimeError;

  private readonly stoppedCb!: () => void;

  constructor(
    id: string,
    code: string,
    opts: EvaluateOptionsForWorker<AvailableScopes>,
    private server: Server<AvailableScopes>,
    stoppedCb: () => void,
  ) {
    const parsed = safe(() => parse(code, opts.parse));
    if ("error" in parsed) {
      this.server.tryPostMessage(
        ["batch_report", id, { error: parsed.error }, true, null],
      );
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

    this.stoppedCb = stoppedCb;

    this.initBatchReporter();

    this.samplingLoop(parsed.ok, opts);
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
      this.server.tryPostMessage(
        ["batch_report", this.id, this.report, shouldStop, null],
      );
    }, this.server.init.batchReportInterval.ms);
  }

  private markBatchToStop(error?: Error | RuntimeError) {
    this.shouldStop = error ? error : true;
    this.report.statistics!.now.ms = Date.now();
  }

  private async samplingLoop(
    node: Node,
    opts: EvaluateOptionsForWorker<AvailableScopes>,
  ) {
    const executeOpts = this.server.evaluator.makeExecuteOptions(opts);

    while (true) {
      const durationSinceLastHB = Date.now() - this.server.pulser.lastHeartbeat;
      if (durationSinceLastHB > this.server.init.minHeartbeatInterval.ms) {
        await new Promise((r) => setTimeout(r, 0)); // 交回控制权
      }
      if (this.shouldStop) break;

      const executed = safe(() =>
        this.server.evaluator.execute(node, executeOpts)
      );
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
