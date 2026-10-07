import type * as I from "@dicexp/interface";

import { Server } from "./server";
import { InitialMessageFromWorker, MessageToWorker } from "./types";
import { makeSendableError } from "./utils";

let hasAddedMessageListener = false;

export async function startWorkerServer(
  evaluatorMaker: () => I.Evaluator | Promise<I.Evaluator>,
) {
  let server: Server | null = null;
  let initializing = false;

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
      if (server || initializing) {
        const error = new Error("Worker 重复初始化");
        tryPostMessage(["initialize_result", ["error", error]]);
        return;
      }
      const init = msg[1];
      initializing = true;
      // Deliberate deviation from naive: the evaluator is created ONCE here,
      // when `initialize` is handled, and is reused by every request — naive
      // instead creates a fresh evaluator per request. Safe because nova
      // resets the heap and re-seeds the RNG on every evaluation.
      void (async () => {
        let evaluator: I.Evaluator;
        try {
          evaluator = await evaluatorMaker();
        } catch (e) {
          if (!(e instanceof Error)) {
            e = new Error(`未知抛出: ${e}`);
          }
          initializing = false;
          tryPostMessage(["initialize_result", ["error", e as Error]]);
          return;
        }
        server = new Server(init, evaluator);
        initializing = false;
        tryPostMessage(["initialize_result", "ok"]);
      })();
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
