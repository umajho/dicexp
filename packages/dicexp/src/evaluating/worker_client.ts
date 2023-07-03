import { Unreachable } from "@dicexp/errors";
import { ErrorDataFromWorker, proxyErrorFromWorker } from "./error_from_worker";
import { EvaluationResult } from "./evaluate";
import {
  DataFromWorker,
  DataToWorker,
  EvaluateOptionsForWorker,
  InitializationResult,
} from "./worker/types";
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
    | [name: "processing", id: string, resolve: (r: EvaluationResult) => void]
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
          resolve({ error });
        } else { // "batch_processing"
          const report = this.taskState[2];
          report({ error }); // FIXME: 应该保留之前的数据
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
        resolve({ error: new Error("内部中断") });
      } else {
        resolve({ error: new Error("外部中断") });
      }
    } else if (this.taskState[0] === "batch_processing") {
      const report = this.taskState[2];
      if (from === "internal") {
        report({ error: new Error("内部中断") }); // FIXME: 保留原先数据
      } else if (from === "external") {
        console.warn("批量任务不应该使用 terminate 终结。");
        report({ error: new Error("外部中断") }); // FIXME: 保留原先数据
      }
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
      case "initialize_result":
        this.handleInitializeResult(data[1]);
        return;
      case "heartbeat":
        this.handleHeartbeat();
        return;
      case "fatal": {
        const error = data[1];
        this.handleFatal(new Error(error));
        return;
      }
      case "evaluate_result": {
        const id = data[1], result = data[2], errorData = data[3];
        this.handleEvaluateResult(id, result, errorData);
        return;
      }
      case "batch_report": {
        const id = data[1],
          report = data[2],
          stopped = data[3],
          errorData = data[4];
        this.handleBatchReport(id, report, stopped, errorData);
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
    if (result.ok) {
      resolve();
    } else {
      reject(proxyErrorFromWorker(result.error));
    }
  }

  private handleHeartbeat() {
    this.lastHeartbeatTimestamp = Date.now();
  }

  private handleFatal(error: Error) {
    switch (this.taskState[0]) {
      case "idle": {
        console.error(error);
        break;
      }
      case "processing": {
        const [_1, _2, resolve] = this.taskState;
        resolve({ error });
        break;
      }
      case "batch_processing": {
        const [_1, _2, report, resolve] = this.taskState;
        report({ error });
        resolve();
        break;
      }
    }
    this.taskState = ["idle"];
    this._terminate();
  }

  async evaluate(code: string, opts: EvaluateOptionsForWorker) {
    return new Promise<EvaluationResult>((resolve, reject) => {
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

          resolve({ error: new Error("硬性超时") });
          this.taskState = ["idle"];

          this.terminate();
        }, ms);
      }

      this.postMessage(["evaluate", id, code, opts]);
    });
  }

  private handleEvaluateResult(
    id: string,
    result: EvaluationResultForWorker,
    errorData: ErrorDataFromWorker | null,
  ) {
    this.assertTaskStateName("processing");
    if (this.taskState[0] !== "processing") { // TS 类型推断
      throw new Unreachable();
    }
    const [_, idRecorded, resolve] = this.taskState;

    if (idRecorded !== id) {
      throw new Error(`Task ID 不匹配：期待 ${idRecorded}，实际为 ${id}`);
    }

    if (errorData) {
      result.error = proxyErrorFromWorker(errorData);
      if (errorData.specialType) {
        result.specialErrorType = errorData.specialType;
      }
    }
    resolve(result);
    this.taskState = ["idle"];
  }

  async batch(
    code: string,
    opts: EvaluateOptionsForWorker,
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

  handleBatchReport(
    id: string,
    report: BatchReportForWorker,
    stopped: boolean,
    errorData: ErrorDataFromWorker | null,
  ) {
    this.assertTaskStateName("batch_processing");
    if (this.taskState[0] !== "batch_processing") { // TS 类型推断
      throw new Unreachable();
    }
    const [_, idRecorded, reporter, resolve] = this.taskState;

    if (idRecorded !== id) {
      throw new Error(`Batch ID 不匹配：期待 ${idRecorded}，实际为 ${id}`);
    }
    if (stopped) {
      resolve();
      this.taskState = ["idle"];
    }
    if (errorData) {
      report.error = proxyErrorFromWorker(errorData);
      if (errorData.specialType) {
        report.specialErrorType = errorData.specialType;
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
