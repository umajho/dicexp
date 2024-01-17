import { Unreachable } from "@dicexp/errors";
import {
  EvaluationGenerationOptions,
  EvaluationGenerator,
  MakeEvaluationGeneratorResult,
  RuntimeError,
  SamplingReport,
  SamplingResult,
  SamplingStatistic,
} from "@dicexp/interface";

import type { Evaluator } from "dicexp/internal";
import type { Scope } from "@dicexp/runtime/scopes";

import { Server } from "./server";

export class SamplingHandler<AvailableScopes extends Record<string, Scope>> {
  private readonly result: SamplingResult = { samples: 0, counts: {} };
  private readonly statis: SamplingStatistic | null = null;

  private shouldStop: boolean | Error | RuntimeError = false;

  constructor(
    evaluator: Evaluator,
    private readonly id: string,
    code: string,
    opts: EvaluationGenerationOptions,
    private server: Server<AvailableScopes>,
    private readonly stoppedCb: () => void,
  ) {
    const nowMs = Date.now();

    let makeGeneratorResult = ((): MakeEvaluationGeneratorResult => {
      try {
        return evaluator.makeEvaluationGenerator(code, opts);
      } catch (e) {
        if (!(e instanceof Error)) {
          e = new Error(`未知抛出: ${e}`);
        }
        return ["error", "other", e as Error];
      }
    })();

    if (makeGeneratorResult[0] === "error") {
      this.server.tryPostMessage(
        ["batch_report", id, makeGeneratorResult],
      );
      stoppedCb();
      return;
    }

    this.statis = { start: { ms: nowMs }, now: { ms: nowMs } };

    this.initBatchReporter();

    this.samplingLoop(makeGeneratorResult[1]);
  }

  private initBatchReporter() {
    const intervalId = setInterval(() => {
      let report: SamplingReport;

      if (this.shouldStop) {
        if (this.shouldStop instanceof Error) {
          const err = this.shouldStop;
          report = ["error", "sampling", err, this.result, this.statis];
        } else {
          if (this.shouldStop === true) {
            report = ["stop", this.result, this.statis];
          } else {
            const err = new Error(
              "某次求值时遭遇运行时错误：" +
                (this.shouldStop satisfies RuntimeError).message,
            );
            report = ["error", "sampling", err, this.result, this.statis];
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

  private async samplingLoop(generator: EvaluationGenerator) {
    while (true) {
      const durationSinceLastHB = Date.now() - this.server.pulser.lastHeartbeat;
      if (durationSinceLastHB > this.server.init.minHeartbeatInterval.ms) {
        await new Promise((r) => setTimeout(r, 0)); // 交回控制权
      }
      if (this.shouldStop) break;

      let stepResult: ReturnType<typeof generator.next>;
      try {
        stepResult = generator.next();
      } catch (e) {
        if (!(e instanceof Error)) {
          e = new Error(`未知抛出: ${e}`);
        }
        this.markBatchToStop(e as Error);
        break;
      }
      if (stepResult.done) {
        if (stepResult.value[0] !== "error") {
          throw new Unreachable();
        }
        this.markBatchToStop(stepResult.value[2]);
      }

      const value = stepResult.value[1];
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
