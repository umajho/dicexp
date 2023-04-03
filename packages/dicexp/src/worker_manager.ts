import EvaluatingWorker from "./worker?worker";

import type { EvaluateOptions, EvaluationResult } from "./evaluate";
import type {
  DataFromWorker,
  DataToWorker,
  EvaluatingSpecialErrorType,
  InitializationResult,
} from "./wokre_types";

export type EvaluateOptionsForWorker = EvaluateOptions & {
  restrictions?: {
    /**
     * 硬性的超时限制，必定生效，但若触发会失去所有执行信息。
     *
     * 默认无超时。
     */
    hardTimeout?: { ms: number };
  };
};

export type EvaluationRestrictionsForWorker =
  EvaluateOptionsForWorker["restrictions"];

export type EvaluationResultForWorker = EvaluationResult & {
  specialErrorType?: EvaluatingSpecialErrorType;
};

export class EvaluatingWorkerManager {
  options: EvaluatingWorkerClientOptions;

  private readinessWatcher: (ready: boolean) => void;

  client: EvaluatingWorkerClient | null = null;

  constructor(
    readinessWatcher: (ready: boolean) => void,
    optsPartial: Partial<EvaluatingWorkerClientOptions> = {},
  ) {
    optsPartial = { ...optsPartial };
    optsPartial.heartbeatTimeout ??= { ms: 5000 };
    optsPartial.minHeartbeatInterval ??= { ms: 250 };
    this.options = optsPartial as EvaluatingWorkerClientOptions;

    this.readinessWatcher = readinessWatcher;

    this.initClient();
  }

  private async initClient() {
    this.client = new EvaluatingWorkerClient(
      new EvaluatingWorker(),
      this.options,
    );
    this.client.afterTerminate = () => {
      this.client = null;
      this.readinessWatcher(false);
      this.initClient();
    };
    await this.client.init();
    this.readinessWatcher(true);
  }

  async evaluate(code: string, opts?: EvaluateOptionsForWorker) {
    if (!this.client) {
      throw new Error("管理器下的客户端尚未初始化");
    }
    return this.client.evaluate(code, opts);
  }

  terminateClient() {
    if (!this.client) return;
    this.client.terminate();
  }
}

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
}

class EvaluatingWorkerClient {
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
  private taskState:
    | [name: "idle"]
    | [name: "processing", id: string, resolve: (r: EvaluationResult) => void] =
      ["idle"];

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

      if (this.taskState["0"] === "processing") {
        const resolve = this.taskState[2];
        const unresponsiveMs = now - this.lastHeartbeatTimestamp;
        resolve({
          error: new Error(
            `Worker 失去响应（超过 ${unresponsiveMs} 毫秒没有收到心跳消息）`,
          ),
        });
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
        console.warn("内部中断没有 resolve 正在进行的 task");
        resolve({ error: new Error("内部中断") });
      } else {
        resolve({ error: new Error("外部中断") });
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
      case "evaluate_result": {
        const id = data[1], result = data[2], specialErrorType = data[3];
        this.handleEvaluateResult(id, result, specialErrorType);
        return;
      }
      default:
        console.error("Unreachable!");
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
      reject(result.error);
    }
  }

  private handleHeartbeat() {
    this.lastHeartbeatTimestamp = Date.now();
  }

  async evaluate(code: string, opts?: EvaluateOptionsForWorker) {
    return new Promise<EvaluationResult>((resolve, reject) => {
      if (this.taskState[0] === "processing") {
        reject(new Error("Worker 客户端正忙"));
        return;
      }

      const id = String(this.nextTaskIdNumber);
      this.nextTaskIdNumber++;

      this.taskState = ["processing", id, resolve];

      if (opts?.restrictions?.hardTimeout) {
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
    specialErrorType: EvaluatingSpecialErrorType | null,
  ) {
    if (this.taskState[0] === "idle") {
      throw new Error("Worker 客户端找不到正在进行的 task！");
    }
    const [_, idRecorded, resolve] = this.taskState;
    if (idRecorded !== id) {
      throw new Error(`Task ID 不匹配：期待 ${idRecorded}，实际为 ${id}`);
    }

    if (specialErrorType) {
      result.specialErrorType = specialErrorType;
    }
    resolve(result);
    this.taskState = ["idle"];
  }
}