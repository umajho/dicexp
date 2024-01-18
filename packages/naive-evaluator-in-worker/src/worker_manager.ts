import {
  EvaluationGenerationOptions,
  RemoteEvaluationOptions,
  RemoteEvaluatorClient,
  RemoteSampler,
} from "@dicexp/interface";

import { EvaluationResult } from "@dicexp/naive-evaluator/internal";

import {
  EvaluatingWorkerClient,
  EvaluatingWorkerClientOptions,
} from "./worker_client";
import { NewEvaluatorOptionsForWorker } from "./worker-inner/types";

export interface NewEvaluatingWorkerManagerOptions {
  newEvaluatorOptions: NewEvaluatorOptionsForWorker;
}

export class EvaluatingWorkerManager
  implements RemoteEvaluatorClient, RemoteSampler {
  readonly clientOptions: EvaluatingWorkerClientOptions;

  private client: EvaluatingWorkerClient | null = null;

  newEvaluatorOptions: NewEvaluatorOptionsForWorker;

  constructor(
    workerProvider: () => Worker,
    private readinessWatcher: (ready: boolean) => void,
    opts: NewEvaluatingWorkerManagerOptions,
    clientOptsPartial: Partial<EvaluatingWorkerClientOptions> = {},
  ) {
    this.newEvaluatorOptions = opts.newEvaluatorOptions;

    this.clientOptions = {
      heartbeatTimeout: { ms: 5000 },
      minHeartbeatInterval: { ms: 250 },
      samplingReportInterval: { ms: 500 },
      ...clientOptsPartial,
    };

    this.initClient(workerProvider);
  }

  private async initClient(workerProvider: () => Worker) {
    this.client = //
      new EvaluatingWorkerClient(workerProvider(), this.clientOptions);
    this.client.afterTerminate = () => {
      this.client = null;
      this.readinessWatcher(false);
      this.initClient(workerProvider);
    };
    await this.client.init();
    this.readinessWatcher(true);
  }

  async evaluateRemote(
    code: string,
    opts: RemoteEvaluationOptions,
  ): Promise<EvaluationResult> {
    if (!this.client) {
      throw new Error("管理器下的客户端尚未初始化");
    }
    return this.client.evaluateRemote(code, {
      hardTimeout: opts.local?.restrictions?.hardTimeout ?? null,
      newEvaluator: this.newEvaluatorOptions,
      evaluation: opts,
    });
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

  keepSampling(code: string, opts: EvaluationGenerationOptions) {
    if (!this.client) {
      throw new Error("管理器下的客户端尚未初始化");
    }
    return this.client.keepSampling(code, {
      newEvaluator: this.newEvaluatorOptions,
      evaluationGeneration: opts,
    });
  }

  stopSampling() {
    if (!this.client) return;
    this.client.stopSampling();
  }
}
