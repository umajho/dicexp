import EvaluatingWorker from "./worker/worker?worker";

import type { BatchReport, EvaluateOptionsForWorker } from "./worker/types";
import {
  EvaluatingWorkerClient,
  type EvaluatingWorkerClientOptions,
} from "./worker_client";

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
    optsPartial.batchReportInterval ??= { ms: 500 };
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

  async evaluate(code: string, opts: EvaluateOptionsForWorker) {
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
    opts: EvaluateOptionsForWorker,
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
