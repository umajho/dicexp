import { Unimplemented } from "@dicexp/errors";
import { EvaluationOptions, SamplingReport } from "@dicexp/interface";

import {
  EvaluationResult,
  Evaluator,
  NewEvaluatorOptions,
} from "dicexp/internal";

import type { Scope } from "@dicexp/runtime/scopes";

import { SamplingHandler } from "./handler_batch";
import { Pulser } from "./heartbeat";
import {
  DataFromWorker,
  DataToWorker,
  NewEvaluatorOptionsForWorker,
  WorkerInit,
} from "./types";

declare function postMessage(data: DataFromWorker): void;

export class Server<AvailableScopes extends Record<string, Scope>> {
  init!: WorkerInit;
  pulser!: Pulser;

  batchHandler: SamplingHandler<AvailableScopes> | null = null;

  constructor(
    private evaluatorMaker: (opts: NewEvaluatorOptions) => Evaluator,
    public availableScopes: AvailableScopes,
  ) {}

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
      case "evaluate": {
        const id = data[1];
        const code = data[2], newEvaluatorOpts = data[3], opts = data[4];
        if (this.batchHandler) {
          const error = new Error("批量处理途中不能进行单次求值");
          const data: EvaluationResult = ["error", "other", error];
          this.tryPostMessage(["evaluate_result", id, data]);
          return;
        }
        const evaluator = this.evaluatorMaker(
          this.makeEvaluatorOptions(newEvaluatorOpts),
        );
        this.tryPostMessage(
          handleEvaluateSingle(evaluator, id, code, opts),
        );
        return;
      }
      case "batch_start": {
        const id = data[1];
        const code = data[2], newEvaluatorOpts = data[3], opts = data[4];
        if (this.batchHandler) {
          const error = new Error("已在进行批量处理");
          const data: SamplingReport = ["error", "other", error];
          this.tryPostMessage(["batch_report", id, data]);
          return;
        }
        const evaluator = this.evaluatorMaker(
          this.makeEvaluatorOptions(newEvaluatorOpts),
        );
        const clear = () => this.batchHandler = null;
        this.batchHandler = //
          new SamplingHandler(evaluator, id, code, opts, this, clear);
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

  makeEvaluatorOptions(
    opts: NewEvaluatorOptionsForWorker,
  ): NewEvaluatorOptions {
    const topLevelScope = this.availableScopes[opts.topLevelScope];
    if (!topLevelScope) {
      throw new Unimplemented(
        "TODO: 处理指定 `topLevelScope` 不存在于 `availableScopes` 中的情况",
      );
    }
    return {
      topLevelScope,
      randomSourceMaker: opts.randomSourceMaker,
    };
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
        if (report[1] === "sampling") {
          data[2] = ["error", "sampling", sendableErr, report[3], report[4]];
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
}

function handleEvaluateSingle(
  evaluator: Evaluator,
  id: string,
  code: string,
  opts: EvaluationOptions,
): DataFromWorker {
  let result: EvaluationResult;
  try {
    result = evaluator.evaluate(code, opts);
  } catch (e) {
    if (!(e instanceof Error)) {
      e = new Error(`未知抛出: ${e}`);
    }
    result = ["error", "other", e as Error];
  }
  return ["evaluate_result", id, result];
}

function makeSendableError(
  err: { name?: string; message: string; stack?: string },
): Error {
  return { name: err.name ?? "Error", message: err.message, stack: err.stack };
}
