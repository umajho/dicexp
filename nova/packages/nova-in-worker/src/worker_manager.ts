import type * as I from "@dicexp/interface";

import {
  EvaluatingWorkerClient,
  EvaluatingWorkerClientOptions,
} from "./worker_client";
import { NewEvaluatorOptionsForWorker } from "./worker-inner/types";

/**
 * Backoff schedule for retrying worker-client initialization: after the
 * initial attempt fails, retries start after ~250 ms, ~1 s and ~5 s (3
 * retries, 4 attempts in total). Once these are exhausted the manager is
 * permanently failed (see `NewEvaluatingWorkerManagerOptions.onInitError`).
 */
const INIT_RETRY_DELAYS_MS: readonly number[] = [250, 1000, 5000];

export interface NewEvaluatingWorkerManagerOptions {
  newEvaluatorOptions: NewEvaluatorOptionsForWorker;
  /**
   * Invoked once, with the last failure's error, if initializing the
   * worker client fails for good — the initial attempt and every
   * scheduled retry failed. From then on the manager rejects every
   * `evaluateRemote`/`keepSampling` call with that error's cause.
   *
   * Not invoked when the failure is due to `destroy()` — that is
   * intentional, not an error worth surfacing.
   */
  onInitError?: (error: Error) => void;
}

export class EvaluatingWorkerManager
  implements I.RemoteEvaluatorClient, I.RemoteSamplerClient {
  readonly clientOptions: EvaluatingWorkerClientOptions;

  private client: EvaluatingWorkerClient | null = null;

  /** Set once initialization has failed for good; see `initClient`. */
  private initError: Error | null = null;

  /** Set by `destroy()`; stops retries and any further client creation. */
  private destroyed = false;

  /**
   * Bumped by every `initClient` cycle; a cycle observing a mismatched
   * epoch has been superseded (by a newer cycle, or made moot by
   * `destroy()`) and must stop.
   */
  private initEpoch = 0;

  /** Pending retry timer of the live init cycle, if any. */
  private initRetryTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * The client whose `init()` the live init cycle is currently awaiting,
   * if any. `afterTerminate` uses it to tell an init-phase termination
   * (the awaiting cycle's own catch handles cleanup + retries; no new
   * cycle must be started here, or the two would fight) from a running
   * client's termination (which starts a fresh cycle, with its own
   * retry budget).
   */
  private initingClient: EvaluatingWorkerClient | null = null;

  private onInitError: ((error: Error) => void) | undefined;

  newEvaluatorOptions: NewEvaluatorOptionsForWorker;

  constructor(
    workerProvider: () => Worker,
    private readinessWatcher: (ready: boolean) => void,
    opts: NewEvaluatingWorkerManagerOptions,
    clientOptsPartial: Partial<EvaluatingWorkerClientOptions> = {},
  ) {
    this.newEvaluatorOptions = opts.newEvaluatorOptions;
    this.onInitError = opts.onInitError;

    this.clientOptions = {
      heartbeatTimeout: { ms: 5000 },
      minHeartbeatInterval: { ms: 250 },
      samplingReportInterval: { ms: 500 },
      ...clientOptsPartial,
    };

    this.initClient(workerProvider);
  }

  /**
   * One cycle = creating + initializing one worker client, retrying with
   * backoff on failure (fresh client — and worker — per attempt).
   *
   * The cycle is fire-and-forget and must never reject: every await is
   * either inside the `try` below or a sleep that only resolves.
   */
  private async initClient(workerProvider: () => Worker) {
    const epoch = ++this.initEpoch;

    for (let attempt = 0;; attempt++) {
      if (this.destroyed || epoch !== this.initEpoch) return;

      let client: EvaluatingWorkerClient | null = null;
      try {
        client = new EvaluatingWorkerClient(
          workerProvider(),
          this.clientOptions,
        );
        this.client = client;
        this.initingClient = client;
        client.afterTerminate = () => {
          if (this.initingClient === client) {
            // Terminated while its init is still being awaited (e.g. a
            // "fatal" message, or an external terminate): the awaiting
            // cycle's own catch — reached via the init rejection — owns
            // cleanup and retries. Starting a new cycle here would race
            // (and, on persistent failures, loop unboundedly) with it.
            return;
          }
          // Terminated while running (watchdog timeout, "fatal", or an
          // external terminate — the latter expects recreation): start a
          // fresh cycle, which gets its own retry budget.
          if (this.client === client) this.client = null;
          this.readinessWatcher(false);
          if (!this.destroyed) this.initClient(workerProvider);
        };

        await client.init();
        if (this.initingClient === client) this.initingClient = null;
        this.readinessWatcher(true);
        return;
      } catch (e) {
        const cause = e instanceof Error ? e : new Error(`未知抛出：${e}`);
        console.error(
          `初始化 nova 求值器的 Worker 客户端失败（第 ${attempt + 1} 次尝试）：`,
          cause,
        );

        // Tear the failed client down without re-entering the terminate
        // handler above — this cycle owns the retries.
        if (client) {
          client.afterTerminate = undefined;
          if (this.initingClient === client) this.initingClient = null;
          if (this.client === client) this.client = null;
          client.terminate();
        }

        if (this.destroyed || epoch !== this.initEpoch) return;

        if (attempt >= INIT_RETRY_DELAYS_MS.length) {
          // Retries exhausted: permanently failed. `readinessWatcher` is
          // not notified here — the client never became ready, so the
          // watcher already reflects "not ready" (a client that died
          // while running reports that via `afterTerminate` above).
          this.initError = cause;
          try {
            this.onInitError?.(cause);
          } catch (hookError) {
            // A throwing hook must not become an unhandled rejection.
            console.error("调用 onInitError 钩子时抛出异常：", hookError);
          }
          return;
        }

        await new Promise<void>((resolve) => {
          this.initRetryTimeoutId = //
            setTimeout(resolve, INIT_RETRY_DELAYS_MS[attempt]!);
        });
        this.initRetryTimeoutId = null;
        // The loop head re-checks `destroyed`/epoch before retrying.
      }
    }
  }

  async evaluateRemote(
    code: string,
    opts: I.RemoteEvaluationOptions,
  ): Promise<I.EvaluationResult> {
    if (this.initError) {
      throw new Error(`nova 求值器初始化失败：${this.initError.message}`);
    }
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
    this.destroyed = true;
    // Stop a pending retry: its timer is cleared, so the awaiting cycle
    // never wakes (its loop-head guard would stop it anyway).
    if (this.initRetryTimeoutId !== null) {
      clearTimeout(this.initRetryTimeoutId);
      this.initRetryTimeoutId = null;
    }
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

  keepSampling(code: string, opts: I.RemoteSamplingOptions) {
    if (this.initError) {
      throw new Error(`nova 求值器初始化失败：${this.initError.message}`);
    }
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
