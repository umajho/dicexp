import type { EvaluationResult } from "dicexp/internal";
import type {
  EvaluationGenerationOptions,
  EvaluationOptions,
  SamplingErrorReport,
  SamplingOkReport,
  SamplingReport,
} from "@dicexp/interface";
import { Unreachable } from "@dicexp/errors";

import { proxyErrorFromWorker } from "./error_from_worker";
import {
  DataFromWorker,
  DataToWorker,
  InitializationResult,
  NewEvaluatorOptionsForWorker,
} from "./worker-inner/types";

export interface EvaluatingWorkerClientOptions {
  /**
   * 超多多长时间视作 Worker 无响应。
   *
   * 默认为 1 秒。
   */
  heartbeatTimeout: { ms: number };
  /**
   * 至少间隔多少时间发送下一次心跳包。
   *
   * 目前的实现是每次求完值后才有机会发送心跳包。
   *
   * 默认为 250 毫秒。
   */
  minHeartbeatInterval: { ms: number };
  /**
   * 每次间隔多久汇报抽样报告。
   */
  samplingReportInterval: { ms: number };
}

export interface EvaluatingWorkerClientEvaluationOptions {
  hardTimeout: { ms: number } | null;

  newEvaluator: NewEvaluatorOptionsForWorker;
  evaluation: EvaluationOptions;
}

export interface EvaluatingWorkerClientSamplingOptions {
  newEvaluator: NewEvaluatorOptionsForWorker;
  evaluationGeneration: EvaluationGenerationOptions;
}

export class EvaluatingWorkerClient {
  constructor(
    private worker: Worker,
    private options: EvaluatingWorkerClientOptions,
  ) {}

  afterTerminate?: () => void;

  private initState:
    | [name: "uninitialized"]
    | [name: "initializing", resolve: () => void, reject: (e: Error) => void]
    | [name: "initialized"]
    | [name: "terminated"] = ["uninitialized"];

  private nextTaskIdNumber = 1;
  private nextId() {
    const id = String(this.nextTaskIdNumber);
    this.nextTaskIdNumber++;
    return id;
  }

  private taskState:
    | [name: "idle"]
    | [
      name: "processing",
      id: string,
      resolve: (r: EvaluationResult) => void,
    ]
    | [
      name: "sampling_processing",
      id: string,
      report: (r: SamplingReport) => void,
      resolve: () => void,
    ] = ["idle"];

  private lastHeartbeatTimestamp!: number;

  async init() {
    if (this.initState[0] !== "uninitialized") {
      throw new Error("Worker 客户端重复初始化");
    }
    await this.initWorker();
    await this.initWatchdog();
  }

  private async initWorker(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.worker.onmessage = (ev) => {
        if (ev.data[0] === "loaded") {
          resolve();
        }
      };
    });
    this.worker.onmessage = this.onMessage.bind(this);
    return new Promise((resolve, reject) => {
      this.initState = ["initializing", resolve, reject];
      this.postMessage(["initialize", this.options]);
    });
  }

  private async initWatchdog() {
    this.lastHeartbeatTimestamp = Date.now();

    const tick = async () => {
      if (this.initState[0] === "terminated") return;

      const timeoutMs = this.options.heartbeatTimeout.ms;
      const deadline = this.lastHeartbeatTimestamp + timeoutMs;
      const now = Date.now();
      if (now <= deadline) {
        setTimeout(tick, deadline - now + 1);
        return;
      }

      if (this.taskState[0] !== "idle") {
        const unresponsiveMs = now - this.lastHeartbeatTimestamp;
        const error = new Error(
          `联络 Worker 的客户端失去与 Worker 联络（超过 ${unresponsiveMs} 毫秒没有收到心跳消息）`,
        );
        if (this.taskState[0] === "processing") {
          const resolve = this.taskState[2];
          resolve(["error", "other", error]);
        } else { // "sampling_processing"
          const report = this.taskState[2];
          report(["error", "other", error]); // FIXME: 应该保留之前的数据
        }
        this.taskState = ["idle"];
      } else {
        console.warn(
          "联络 Worker 的客户端在 Worker 空闲的状态下失去与 Worker 联络",
        );
      }
      this._terminate();
    };

    await tick();
  }

  /**
   * 用 `afterTerminate` 来获知本操作的完成
   */
  terminate() {
    this._terminate("external");
  }

  private _terminate(from: "internal" | "external" = "internal") {
    this.worker.terminate();
    this.initState = ["terminated"];

    let fn: ((v: ["error", "other", Error]) => void) | undefined;
    let isSampling = false;
    if (this.taskState[0] === "processing") {
      fn = this.taskState[2]; // resolve
    } else if (this.taskState[0] === "sampling_processing") {
      isSampling = true;
      fn = this.taskState[2];
    }
    if (fn) {
      const err = new Error(
        `Worker 客户端由于${from === "internal" ? "外" : "内"}部原因中断`,
      );
      if (from === "external" && isSampling) {
        console.warn("抽样任务不应该使用 terminate 终结。");
      }
      fn(["error", "other", err]); // FIXME: 保留原先数据
    }

    this.afterTerminate?.();
  }

  private postMessage(data: DataToWorker) {
    // 防止由于 vue 之类的外部库把 data 中的内容用 Proxy 替代掉，
    // 导致无法用 postMessage 传递 data
    data = JSON.parse(JSON.stringify(data));
    this.worker.postMessage(data);
  }

  private onMessage(ev: MessageEvent<DataFromWorker>) {
    const data = ev.data;
    switch (data[0]) {
      // "loaded" 是在正式建立联系前，用于确保 worker 已完成载入而发送的，
      // 因此不会出现在这里。

      case "initialize_result":
        this.handleInitializeResult(data[1]);
        return;
      case "heartbeat":
        this.handleHeartbeat();
        return;
      case "fatal": {
        this.handleFatal(data[1]);
        return;
      }
      case "evaluate_result": {
        const id = data[1], result = data[2];
        this.handleEvaluateResult(id, result);
        return;
      }
      case "sampling_report": {
        const id = data[1], report = data[2];
        this.handleSamplingReport(id, report);
        return;
      }
      default:
        console.error(
          `收到来自 Worker 的未知消息：「${JSON.stringify(data)}」！`,
        );
    }
  }

  private handleInitializeResult(result: InitializationResult) {
    if (this.initState[0] !== "initializing") {
      throw new Error("Worker 客户端 init 状态异常");
    }
    const [_, resolve, reject] = this.initState;
    if (result === "ok") {
      resolve();
    } else { // result[0] === "error"
      reject(proxyErrorFromWorker(result[1]));
    }
  }

  private handleHeartbeat() {
    this.lastHeartbeatTimestamp = Date.now();
  }

  private handleFatal(reason: string | undefined) {
    const error = new Error(reason);

    switch (this.taskState[0]) {
      case "idle": {
        console.error(error);
        break;
      }
      case "processing": {
        const [_1, _2, resolve] = this.taskState;
        resolve(["error", "other", error]);
        break;
      }
      case "sampling_processing": {
        const [_1, _2, report, resolve] = this.taskState;
        report(["error", "other", error]);
        resolve();
        break;
      }
    }
    this.taskState = ["idle"];
    this._terminate();
  }

  async evaluateRemote(
    code: string,
    opts: EvaluatingWorkerClientEvaluationOptions,
  ) {
    return new Promise<EvaluationResult>((resolve, reject) => {
      if (this.taskState[0] !== "idle") {
        reject(new Error("Worker 客户端正忙"));
        return;
      }

      const id = this.nextId();

      this.taskState = ["processing", id, resolve];

      if (opts.hardTimeout) {
        setTimeout(() => {
          if (this.taskState[0] === "idle") return;
          const [_, idRecorded, resolve] = this.taskState;
          if (idRecorded !== id) return;

          resolve(["error", "other", new Error("硬性超时")]);
          this.taskState = ["idle"];

          this.terminate();
        }, opts.hardTimeout.ms);
      }

      this.postMessage(
        ["evaluate", id, code, opts.newEvaluator, opts.evaluation],
      );
    });
  }

  private handleEvaluateResult(id: string, result: EvaluationResult) {
    this.assertTaskStateName("processing");
    if (this.taskState[0] !== "processing") { // TS 类型推断
      throw new Unreachable();
    }
    const [_, idRecorded, resolve] = this.taskState;

    if (idRecorded !== id) {
      throw new Error(`Task ID 不匹配：期待 ${idRecorded}，实际为 ${id}`);
    }

    if (result[0] === "error") {
      if (result[1] === "parse" || result[1] === "other") {
        result = ["error", result[1], proxyErrorFromWorker(result[2])];
      }
    }
    resolve(result);
    this.taskState = ["idle"];
  }

  async *keepSampling(
    code: string,
    opts: EvaluatingWorkerClientSamplingOptions,
  ) {
    let promise!: Promise<SamplingReport>;
    let resolve!: (v: SamplingReport) => void;
    function makeReportPromise(): Promise<SamplingReport> {
      return new Promise((r) => resolve = r);
    }
    promise = makeReportPromise();
    this._keepSampling(code, opts, (report) => {
      resolve(report);
      if (report[0] !== "continue") return;
      promise = makeReportPromise();
    });

    while (true) {
      const report = await promise;
      if (report[0] === "continue") {
        yield report as SamplingOkReport<"continue">;
      } else {
        return report as SamplingOkReport<"stop"> | SamplingErrorReport;
      }
    }
  }

  private async _keepSampling(
    code: string,
    opts: EvaluatingWorkerClientSamplingOptions,
    reporter: (r: SamplingReport) => void,
  ) {
    return new Promise<void>((resolve, reject) => {
      if (this.taskState[0] !== "idle") {
        reject(new Error("Worker 客户端正忙"));
        return;
      }

      const id = this.nextId();
      this.taskState = ["sampling_processing", id, reporter, resolve];

      this.postMessage(
        [
          "sample_start",
          id,
          code,
          opts.newEvaluator,
          opts.evaluationGeneration,
        ],
      );
    });
  }

  handleSamplingReport(id: string, report: SamplingReport) {
    this.assertTaskStateName("sampling_processing");
    if (this.taskState[0] !== "sampling_processing") { // TS 类型推断
      throw new Unreachable();
    }
    const [_, idRecorded, reporter, resolve] = this.taskState;

    if (idRecorded !== id) {
      throw new Error(`抽样的 ID 不匹配：期待 ${idRecorded}，实际为 ${id}`);
    }
    if (report[0] === "stop" || report[0] === "error") { // 抽样结束了
      resolve();
      this.taskState = ["idle"];
    }
    if (report[0] === "error") {
      const errProxy = proxyErrorFromWorker(report[2]);
      if (report[1] === "sampling") {
        report = ["error", "sampling", errProxy, report[3], report[4]];
      } else { // report[1] === "parse" || report[1] === "other"
        report = ["error", report[1], errProxy];
      }
    }
    reporter(report);
  }

  stopSampling() {
    this.assertTaskStateName("sampling_processing");
    if (this.taskState[0] !== "sampling_processing") { // TS 类型推断
      throw new Unreachable();
    }
    const [_1, id, _2] = this.taskState;

    this.postMessage(["sample_stop", id]);
  }

  assertTaskStateName(expectedName: (typeof this.taskState)[0]) {
    if (this.taskState[0] !== expectedName) {
      throw new Error(
        `Worker 客户端的状态并非 ${expectedName}，而是 ${this.taskState[0]}`,
      );
    }
  }
}
