import type { EvaluationResult } from "dicexp/internal";
import type { Scope } from "@dicexp/runtime/scopes";
import { Unreachable } from "@dicexp/errors";

import { proxyErrorFromWorker } from "./error_from_worker";
import {
  DataFromWorker,
  DataToWorker,
  EvaluationOptionsForWorker,
  InitializationResult,
} from "./worker-inner/types";
import { BatchReportForWorker, EvaluationResultForWorker } from "./types";

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
   * 每次间隔多久汇报批量执行的报告。
   */
  batchReportInterval: { ms: number };
}

export class EvaluatingWorkerClient<
  AvailableScopes extends Record<string, Scope>,
> {
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
      resolve: (r: EvaluationResultForWorker) => void,
    ]
    | [
      name: "batch_processing",
      id: string,
      report: (r: BatchReportForWorker) => void,
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
          `Worker 失去响应（超过 ${unresponsiveMs} 毫秒没有收到心跳消息）`,
        );
        if (this.taskState[0] === "processing") {
          const resolve = this.taskState[2];
          resolve(["error", "worker_client", error]);
        } else { // "batch_processing"
          const report = this.taskState[2];
          report(["error", "worker_client", error]); // FIXME: 应该保留之前的数据
        }
        this.taskState = ["idle"];
      } else {
        console.warn("Worker 在未有工作的状态下失去响应");
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
    if (this.taskState[0] === "processing") {
      const resolve = this.taskState[2];
      if (from === "internal") {
        resolve(["error", "worker_client", new Error("内部中断")]);
      } else {
        resolve(["error", "worker_client", new Error("外部中断")]);
      }
    } else if (this.taskState[0] === "batch_processing") {
      const report = this.taskState[2];
      if (from === "internal") {
        report(["error", "worker_client", new Error("内部中断")]); // FIXME: 保留原先数据
      } else if (from === "external") {
        console.warn("批量任务不应该使用 terminate 终结。");
        report(["error", "worker_client", new Error("外部中断")]); // FIXME: 保留原先数据
      }
    }
    this.afterTerminate?.();
  }

  private postMessage(data: DataToWorker<AvailableScopes>) {
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
      case "batch_report": {
        const id = data[1], report = data[2];
        this.handleBatchReport(id, report);
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
      case "batch_processing": {
        const [_1, _2, report, resolve] = this.taskState;
        report(["error", "other", error]);
        resolve();
        break;
      }
    }
    this.taskState = ["idle"];
    this._terminate();
  }

  async evaluate(
    code: string,
    opts: EvaluationOptionsForWorker<AvailableScopes>,
  ) {
    return new Promise<EvaluationResultForWorker>((resolve, reject) => {
      if (this.taskState[0] !== "idle") {
        reject(new Error("Worker 客户端正忙"));
        return;
      }

      const id = this.nextId();

      this.taskState = ["processing", id, resolve];

      if (opts.restrictions?.hardTimeout) {
        const ms = opts.restrictions.hardTimeout.ms;
        setTimeout(() => {
          if (this.taskState[0] === "idle") return;
          const [_, idRecorded, resolve] = this.taskState;
          if (idRecorded !== id) return;

          resolve(["error", "other", new Error("硬性超时")]);
          this.taskState = ["idle"];

          this.terminate();
        }, ms);
      }

      this.postMessage(["evaluate", id, code, opts]);
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

  async batch(
    code: string,
    opts: EvaluationOptionsForWorker<AvailableScopes>,
    reporter: (r: BatchReportForWorker) => void,
  ) {
    return new Promise<void>((resolve, reject) => {
      if (this.taskState[0] !== "idle") {
        reject(new Error("Worker 客户端正忙"));
        return;
      }

      const id = this.nextId();
      this.taskState = ["batch_processing", id, reporter, resolve];

      this.postMessage(["batch_start", id, code, opts]);
    });
  }

  handleBatchReport(id: string, report: BatchReportForWorker) {
    this.assertTaskStateName("batch_processing");
    if (this.taskState[0] !== "batch_processing") { // TS 类型推断
      throw new Unreachable();
    }
    const [_, idRecorded, reporter, resolve] = this.taskState;

    if (idRecorded !== id) {
      throw new Error(`Batch ID 不匹配：期待 ${idRecorded}，实际为 ${id}`);
    }
    if (report[0] === "stop" || report[0] === "error") { // 批量执行结束了
      resolve();
      this.taskState = ["idle"];
    }
    if (report[0] === "error") {
      const errProxy = proxyErrorFromWorker(report[2]);
      if (report[1] === "batch") {
        report = ["error", "batch", errProxy, report[3], report[4]];
      } else { // report[1] === "parse" || report[1] === "other"
        report = ["error", report[1], errProxy];
      }
    }
    reporter(report);
  }

  stopBatching() {
    this.assertTaskStateName("batch_processing");
    if (this.taskState[0] !== "batch_processing") { // TS 类型推断
      throw new Unreachable();
    }
    const [_1, id, _2] = this.taskState;

    this.postMessage(["batch_stop", id]);
  }

  assertTaskStateName(expectedName: (typeof this.taskState)[0]) {
    if (this.taskState[0] !== expectedName) {
      throw new Error(
        `Worker 客户端的状态并非 ${expectedName}，而是 ${this.taskState[0]}`,
      );
    }
  }
}
