import EvaluatingWorker from "./worker?worker";

import type { EvaluateOptions, EvaluationResult } from "./evaluate";
import type {
  DataFromWorker,
  DataToWorker,
  EvaluatingSpecialErrorType,
} from "./wokre_types";

export interface EvaluatingWorkerManagerOptions {
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

export type EvaluationResultForWorker = EvaluationResult & {
  specialErrorType?: EvaluatingSpecialErrorType;
};

interface EvaluationTask {
  resolve: (r: EvaluationResultForWorker) => void;
  id: string;
}

export class EvaluatingWorkerManager {
  options: EvaluatingWorkerManagerOptions;

  initializing = false;
  worker: Worker | null = null;

  heartbeatTimeout: { ms: number };
  lastHeartbeatTimestamp!: number;

  nextIdNumber = 1;
  currentTask: EvaluationTask | null = null;

  constructor(optsPartial: Partial<EvaluatingWorkerManagerOptions> = {}) {
    optsPartial = { ...optsPartial };
    optsPartial.heartbeatTimeout ??= { ms: 1000 };
    optsPartial.minHeartbeatInterval ??= { ms: 250 };
    this.options = optsPartial as EvaluatingWorkerManagerOptions;

    this.heartbeatTimeout = this.options.heartbeatTimeout;
  }

  private postMessage(data: DataToWorker) {
    this.worker!.postMessage(data);
  }

  async init() {
    if (this.initializing || this.worker) throw new Error("管理器重复初始化");
    this.initializing = true;
    await this.initWorker();
    await this.initWatchdog();
    this.initializing = false;
  }

  private initWorker() {
    return new Promise<void>((resolveInit, rejectInit) => {
      this.lastHeartbeatTimestamp = Date.now();

      const worker = new EvaluatingWorker();

      worker.onmessage = (ev) => {
        const data = ev.data as DataFromWorker;
        switch (data[0]) {
          case "initialize_result": {
            if (!this.initializing || this.worker) {
              rejectInit(new Error("Unreachable"));
            }
            const result = data[1];
            if (result.ok) {
              this.worker = worker;
              resolveInit();
            } else {
              rejectInit(result.error);
            }
            return;
          }
          case "heartbeat": {
            this.lastHeartbeatTimestamp = Date.now();
            return;
          }
          case "evaluate_result": {
            const id = data[1], result = data[2], specialErrorType = data[3];
            this.handleEvaluateResult(id, result, specialErrorType);
            return;
          }
          default:
            console.error("Unreachable!");
        }
      };

      worker.postMessage(["initialize", {
        minHeartbeatInterval: this.options.minHeartbeatInterval,
      }]);
    });
  }

  private async initWatchdog() {
    const tick = async () => {
      if (!this.worker) return; // 小概率事件：worker 挂了还没恢复

      const deadline = this.lastHeartbeatTimestamp + this.heartbeatTimeout.ms;
      const now = Date.now();
      if (now <= deadline) {
        setTimeout(tick, deadline - now + 1);
        return;
      }

      if (this.currentTask) {
        this.resolveCurrentTask({ error: new Error("Worker 失去响应") });
      }
      await this.restartWorker();
    };
    await tick();
  }

  private resolveCurrentTask(r: EvaluationResultForWorker) {
    this.currentTask!.resolve(r);
    this.currentTask = null;
  }

  private async restartWorker() {
    this.worker!.terminate();
    this.worker = null;
    if (this.currentTask) {
      console.error("终结 worker 时 task 尚存");
    }
    await this.init();
  }

  evaluate(code: string, opts?: EvaluateOptionsForWorker) {
    return new Promise<EvaluationResultForWorker>((resolve, reject) => {
      if (this.currentTask) {
        reject(new Error("管理器正忙"));
        return;
      }

      const id = String(this.nextIdNumber);
      this.nextIdNumber++;

      this.currentTask = { id, resolve };

      if (opts?.restrictions?.hardTimeout) {
        const ms = opts.restrictions.hardTimeout.ms;
        setTimeout(() => {
          if (this.currentTask?.id !== id) return; // 已经完成了，或者手动终止了
          this.resolveCurrentTask({ error: new Error("硬性超时") });
          this.restartWorker();
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
    if (!this.currentTask) {
      console.error("找不到对应 task！");
    } else if (this.currentTask.id !== id) {
      console.error(
        `Task ID 不匹配：期待 ${this.currentTask.id}，实际为 ${id}`,
      );
    } else {
      if (specialErrorType) {
        result.specialErrorType = specialErrorType;
      }
      this.resolveCurrentTask(result);
    }
  }
}
