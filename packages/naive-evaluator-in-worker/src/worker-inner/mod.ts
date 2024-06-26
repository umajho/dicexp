import { NewEvaluatorOptions } from "@dicexp/naive-evaluator/internal";

import type { Scope } from "@dicexp/naive-evaluator-runtime/scopes";

import { Server } from "./server";
import { InitialMessageFromWorker, MessageToWorker } from "./types";
import { makeSendableError } from "./utils";
import { NaiveEvaluator } from "./internal-types";

let hasAddedMessageListener = false;

export async function startWorkerServer(
  evaluatorMaker_: ((opts: NewEvaluatorOptions) => NaiveEvaluator) | string,
  topLevelScope_: Scope | string,
) {
  const evaluatorMaker = await (async () => {
    if (typeof evaluatorMaker_ === "string") {
      return (await import(/* @vite-ignore */ evaluatorMaker_))
        .default as (opts: NewEvaluatorOptions) => NaiveEvaluator;
    } else {
      return evaluatorMaker_;
    }
  })();
  const topLevelScope = await (async () => {
    if (typeof topLevelScope_ === "string") {
      return (await import(/* @vite-ignore */ topLevelScope_))
        .default as Scope;
    } else {
      return topLevelScope_;
    }
  })();

  let server: Server | null = null;

  if (hasAddedMessageListener) {
    console.error(
      "试图多次通过 `startWorkerServer` 添加消息监听器，将忽略本次添加",
    );
    return;
  }
  hasAddedMessageListener = true;
  addEventListener("message", (ev) => {
    const msg = ev.data as MessageToWorker;
    if (msg[0] === "initialize") {
      if (server) {
        const error = new Error("Worker 重复初始化");
        tryPostMessage(["initialize_result", ["error", error]]);
        return;
      }
      const init = msg[1];
      server = new Server(init, evaluatorMaker, topLevelScope);
      tryPostMessage(["initialize_result", "ok"]);
      return;
    } else if (!server) {
      console.error("Worker 尚未初始化！");
      return;
    }
    server.handle(msg);
  });

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
