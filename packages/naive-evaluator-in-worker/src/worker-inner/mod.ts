import {
  Evaluator,
  NewEvaluatorOptions,
} from "@dicexp/naive-evaluator/internal";

import type { Scope } from "@dicexp/runtime/scopes";

import { Server } from "./server";
import { InitialMessageFromWorker, MessageToWorker } from "./types";
import { makeSendableError } from "./utils";

export async function startWorkerServer<
  AvailableScopes extends Record<string, Scope>,
>(
  evaluatorMaker_: ((opts: NewEvaluatorOptions) => Evaluator) | string,
  availableScopes_: AvailableScopes | string,
) {
  const evaluatorMaker = await (async () => {
    if (typeof evaluatorMaker_ === "string") {
      return (await import(/* @vite-ignore */ evaluatorMaker_))
        .default as (opts: NewEvaluatorOptions) => Evaluator;
    } else {
      return evaluatorMaker_;
    }
  })();
  const availableScopes = await (async () => {
    if (typeof availableScopes_ === "string") {
      return (await import(/* @vite-ignore */ availableScopes_))
        .default as AvailableScopes;
    } else {
      return availableScopes_;
    }
  })();

  let server: Server<AvailableScopes> | null = null;

  if (onmessage) {
    console.error("onmessage 已被占用，");
  }
  onmessage = (ev) => {
    const msg = ev.data as MessageToWorker;
    if (msg[0] === "initialize") {
      if (server) {
        const error = new Error("Worker 重复初始化");
        tryPostMessage(["initialize_result", ["error", error]]);
        return;
      }
      const init = msg[1];
      server = new Server(init, evaluatorMaker, availableScopes);
      tryPostMessage(["initialize_result", "ok"]);
      return;
    } else if (!server) {
      console.error("Worker 尚未初始化！");
      return;
    }
    server.handle(msg);
  };

  postMessage(["loaded"]);
}

function tryPostMessage(msg: InitialMessageFromWorker): void {
  if (msg[0] === "initialize_result" && msg[1] !== "ok") {
    const result = msg[1];
    msg[1] = ["error", makeSendableError(result[1])];
  }
  try {
    postMessage(msg);
  } catch (e) {
    const errorMessage = (e instanceof Error) ? e.message : `${e}`;
    console.log(msg);
    postMessage(["fatal", "无法发送消息：" + errorMessage]);
  }
}
