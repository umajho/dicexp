import type { RuntimeError } from "dicexp/internal";
import type { Node } from "@dicexp/nodes";
import type { Scope } from "@dicexp/runtime/scopes";

import { getDicexp } from "./dicexp";
import {
  BatchReport,
  BatchResult,
  BatchStatistics,
  EvaluationOptionsForWorker,
} from "./types";
import { safe } from "./utils";
import { Server } from "./server";

export class BatchHandler<AvailableScopes extends Record<string, Scope>> {
  private readonly result: BatchResult = { samples: 0, counts: {} };
  private readonly statis: BatchStatistics | null = null;

  private shouldStop: boolean | Error | RuntimeError = false;

  constructor(
    private readonly id: string,
    code: string,
    opts: EvaluationOptionsForWorker,
    private server: Server<AvailableScopes>,
    private readonly stoppedCb: () => void,
  ) {
    const nowMs = Date.now();

    const parseResult = safe(() => getDicexp().parse(code, opts.parse));
    if (parseResult[0] === "error") {
      this.server.tryPostMessage(
        ["batch_report", id, ["error", "parse", parseResult[1]]],
      );
      stoppedCb();
      return;
    }

    this.statis = { start: { ms: nowMs }, now: { ms: nowMs } };

    this.initBatchReporter();

    this.samplingLoop(parseResult[1], opts);
  }

  private initBatchReporter() {
    const intervalId = setInterval(() => {
      let report: BatchReport;

      if (this.shouldStop) {
        if (this.shouldStop instanceof Error) {
          const err = this.shouldStop;
          report = ["error", "batch", err, this.result, this.statis];
        } else {
          if (this.shouldStop === true) {
            report = ["stop", this.result, this.statis];
          } else {
            const err = new Error(
              "某次求值时遭遇运行时错误：" +
                (this.shouldStop satisfies RuntimeError).message,
            );
            report = ["error", "batch", err, this.result, this.statis];
          }
        }
        clearInterval(intervalId);
        this.stoppedCb();
      } else {
        // 尚未结束时的时间由这里更新，若已结束则在结束时更新，因为后者可能有延时
        this.statis!.now.ms = Date.now();
        report = ["continue", this.result, this.statis];
      }

      this.server.tryPostMessage(["batch_report", this.id, report]);
    }, this.server.init.batchReportInterval.ms);
  }

  private markBatchToStop(error?: Error | RuntimeError) {
    this.shouldStop = error ? error : true;
    this.statis!.now.ms = Date.now();
  }

  private async samplingLoop(
    node: Node,
    opts: EvaluationOptionsForWorker,
  ) {
    const executeOpts = this.server.evaluator.makeExecutionOptions(opts);

    while (true) {
      const durationSinceLastHB = Date.now() - this.server.pulser.lastHeartbeat;
      if (durationSinceLastHB > this.server.init.minHeartbeatInterval.ms) {
        await new Promise((r) => setTimeout(r, 0)); // 交回控制权
      }
      if (this.shouldStop) break;

      const executed = safe(() =>
        this.server.evaluator.execute(node, executeOpts)
      );
      if (executed[0] === "error") { // executed[1] satisfies Error | RuntimeError
        this.markBatchToStop(executed[2]);
        break;
      }
      // executed[0] === "ok"

      const value = executed[1];
      if (typeof value !== "number") { // TODO: 支持布尔值
        const error = new Error(
          `批量时不支持求值结果 "${JSON.stringify(value)}" 的类型`,
        );
        this.markBatchToStop(error);
        break;
      }

      this.result.samples++;
      const oldCount = this.result.counts[value] ?? 0;
      this.result.counts[value] = oldCount + 1;
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
