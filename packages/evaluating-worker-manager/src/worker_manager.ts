import { AsyncEvaluator } from "@dicexp/interface";

import { EvaluationOptionsForWorker } from "./worker-inner/types";
import {
  EvaluatingWorkerClient,
  EvaluatingWorkerClientOptions,
} from "./worker_client";
import { EvaluationResultForWorker } from "./types";

export type NewEvaluatingWorkerManagerOptions = //
  Partial<EvaluatingWorkerClientOptions>;
export type EvaluationOptionsForEvaluatingWorker = EvaluationOptionsForWorker;

export class EvaluatingWorkerManager implements AsyncEvaluator<string> {
  readonly options: Required<NewEvaluatingWorkerManagerOptions>;

  private readinessWatcher: (ready: boolean) => void;

  private client: EvaluatingWorkerClient | null = null;

  constructor(
    workerProvider: () => Worker,
    readinessWatcher: (ready: boolean) => void,
    optsPartial: NewEvaluatingWorkerManagerOptions = {},
  ) {
    optsPartial = { ...optsPartial };
    optsPartial.heartbeatTimeout ??= { ms: 5000 };
    optsPartial.minHeartbeatInterval ??= { ms: 250 };
    optsPartial.batchReportInterval ??= { ms: 500 };
    this.options = optsPartial as EvaluatingWorkerClientOptions;

    this.readinessWatcher = readinessWatcher;

    this.initClient(workerProvider);
  }

  private async initClient(workerProvider: () => Worker) {
    this.client = new EvaluatingWorkerClient(workerProvider(), this.options);
    this.client.afterTerminate = () => {
      this.client = null;
      this.readinessWatcher(false);
      this.initClient(workerProvider);
    };
    await this.client.init();
    this.readinessWatcher(true);
  }

  async evaluate(
    code: string,
    opts: EvaluationOptionsForEvaluatingWorker,
  ): Promise<EvaluationResultForWorker> {
    if (!this.client) {
      throw new Error("管理器下的客户端尚未初始化");
    }
    return this.client.evaluate(code, opts);
  }

  destroy() {
    if (!this.client) return;
    this.client.afterTerminate = () => {
      this.client = null;
      this.readinessWatcher(false);
    };
    this.terminateClient();
  }

  terminateClient() {
    if (!this.client) return;
    this.client.terminate();
  }

  batchEvaluate(
    code: string,
    opts: EvaluationOptionsForEvaluatingWorker,
  ) {
    if (!this.client) {
      throw new Error("管理器下的客户端尚未初始化");
    }
    return this.client.batchEvaluate(code, opts);
  }

  stopBatching() {
    if (!this.client) return;
    this.client.stopBatching();
  }
}
