import { Scope } from "@dicexp/runtime/values";

import { BatchReport, EvaluateOptionsForWorker } from "./worker-builder/types";
import {
  EvaluatingWorkerClient,
  EvaluatingWorkerClientOptions,
} from "./worker_client";

export class EvaluatingWorkerManager<
  AvailableScopes extends Record<string, Scope>,
> {
  options: EvaluatingWorkerClientOptions;

  private readinessWatcher: (ready: boolean) => void;

  client: EvaluatingWorkerClient<AvailableScopes> | null = null;

  constructor(
    workerProvider: () => Worker,
    readinessWatcher: (ready: boolean) => void,
    optsPartial: Partial<EvaluatingWorkerClientOptions> = {},
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
    opts: EvaluateOptionsForWorker<AvailableScopes>,
  ) {
    if (!this.client) {
      throw new Error("管理器下的客户端尚未初始化");
    }
    return this.client.evaluate(code, opts);
  }

  terminateClient() {
    if (!this.client) return;
    this.client.terminate();
  }

  async batch(
    code: string,
    opts: EvaluateOptionsForWorker<AvailableScopes>,
    reporter: (r: BatchReport) => void,
  ) {
    if (!this.client) {
      throw new Error("管理器下的客户端尚未初始化");
    }
    return this.client.batch(code, opts, reporter);
  }

  stopBatching() {
    if (!this.client) return;
    this.client.stopBatching();
  }
}
