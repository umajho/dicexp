import type { Scope } from "@dicexp/runtime/scopes";

import { EvaluateOptionsForWorker } from "./worker-inner/types";
import {
  EvaluatingWorkerClient,
  EvaluatingWorkerClientOptions,
} from "./worker_client";
import { BatchReportForWorker, EvaluationResultForWorker } from "./types";

export type NewEvaluatingWorkerManagerOptions = //
  Partial<EvaluatingWorkerClientOptions>;
export type EvaluateOptionsForEvaluatingWorker<
  AvailableScopes extends Record<string, Scope>,
> = EvaluateOptionsForWorker<AvailableScopes>;

export class EvaluatingWorkerManager<
  AvailableScopes extends Record<string, Scope>,
> {
  readonly options: Required<NewEvaluatingWorkerManagerOptions>;

  private readinessWatcher: (ready: boolean) => void;

  private client: EvaluatingWorkerClient<AvailableScopes> | null = null;

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
    opts: EvaluateOptionsForEvaluatingWorker<AvailableScopes>,
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

  async batch(
    code: string,
    opts: EvaluateOptionsForEvaluatingWorker<AvailableScopes>,
    reporter: (r: BatchReportForWorker) => void,
  ): Promise<void> {
    if (!this.client) {
      throw new Error("管理器下的客户端尚未初始化");
    }
    await this.client.batch(code, opts, reporter);
  }

  stopBatching() {
    if (!this.client) return;
    this.client.stopBatching();
  }
}
