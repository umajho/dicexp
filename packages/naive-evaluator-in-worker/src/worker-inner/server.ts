import { Unimplemented } from "@dicexp/errors";
import { EvaluationOptions, SamplingReport } from "@dicexp/interface";

import {
  EvaluationResult,
  Evaluator,
  NewEvaluatorOptions,
} from "@dicexp/naive-evaluator/internal";

import type { Scope } from "@dicexp/runtime/scopes";

import { SamplingHandler } from "./handler_sampling";
import { Pulser } from "./heartbeat";
import {
  MessageFromServer,
  MessageToServer,
  NewEvaluatorOptionsForWorker,
  WorkerInit,
} from "./types";
import { makeSendableError } from "./utils";

declare function postMessage(msg: MessageFromServer): void;

export class Server<AvailableScopes extends Record<string, Scope>> {
  readonly pulser: Pulser;

  samplingHandler: SamplingHandler<AvailableScopes> | null = null;

  constructor(
    public readonly init: WorkerInit,
    private evaluatorMaker: (opts: NewEvaluatorOptions) => Evaluator,
    readonly availableScopes: AvailableScopes,
  ) {
    this.pulser = new Pulser(
      init.minHeartbeatInterval,
      () => this.tryPostMessage(["heartbeat"]),
    );
  }

  async handle(msg: MessageToServer): Promise<void> {
    const msgType = msg[0];

    switch (msgType) {
      case "evaluate": {
        const id = msg[1];
        const code = msg[2], newEvaluatorOpts = msg[3], opts = msg[4];
        if (this.samplingHandler) {
          const error = new Error("抽样途中不能进行单次求值");
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
      case "sample_start": {
        const id = msg[1];
        const code = msg[2], newEvaluatorOpts = msg[3], opts = msg[4];
        if (this.samplingHandler) {
          const error = new Error("已在进行抽样");
          const data: SamplingReport = ["error", "other", error];
          this.tryPostMessage(["sampling_report", id, data]);
          return;
        }
        const evaluator = this.evaluatorMaker(
          this.makeEvaluatorOptions(newEvaluatorOpts),
        );
        const clear = () => this.samplingHandler = null;
        this.samplingHandler = //
          new SamplingHandler(evaluator, id, code, opts, this, clear);
        return;
      }
      case "sample_stop": {
        const id = msg[1];
        if (!this.samplingHandler) {
          console.warn("不存在正在进行的抽样");
          return;
        }
        this.samplingHandler.handleSamplingStop(id);
        return;
      }
      default:
        console.error(
          `收到来自外界的未知消息：「${JSON.stringify(msgType)}」！`,
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

  tryPostMessage(msg: MessageFromServer): void {
    if (msg[0] === "evaluate_result") {
      let result = msg[2];
      if (
        result[0] === "error" &&
        (result[1] === "parse" || result[1] === "other")
      ) {
        msg[2] = ["error", result[1], makeSendableError(result[2])];
      }
    } else if (msg[0] === "sampling_report") {
      let report = msg[2];
      if (report[0] === "error") {
        const sendableErr = makeSendableError(report[2]);
        if (report[1] === "sampling") {
          msg[2] = ["error", "sampling", sendableErr, report[3], report[4]];
        } else { // report[1] === "parse" || report[1] === "other"
          msg[2] = ["error", report[1], sendableErr];
        }
      }
    }
    try {
      postMessage(msg);
    } catch (e) {
      const errorMessage = (e instanceof Error) ? e.message : `${e}`;
      console.log(msg);
      postMessage(["fatal", "无法发送消息：" + errorMessage]);
    }
  }
}

function handleEvaluateSingle(
  evaluator: Evaluator,
  id: string,
  code: string,
  opts: EvaluationOptions,
): MessageFromServer {
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
