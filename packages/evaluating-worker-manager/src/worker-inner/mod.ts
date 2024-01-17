import { Evaluator, NewEvaluatorOptions } from "dicexp/internal";

import type { Scope } from "@dicexp/runtime/scopes";

import { Server } from "./server";
import { DataToWorker } from "./types";

export async function startWorkerServer<
  AvailableScopes extends Record<string, Scope>,
>(
  evaluatorMaker: ((opts: NewEvaluatorOptions) => Evaluator) | string,
  availableScopes: AvailableScopes | string,
) {
  if (typeof evaluatorMaker === "string") {
    evaluatorMaker = (await import(/* @vite-ignore */ evaluatorMaker))
      .default as (opts: NewEvaluatorOptions) => Evaluator;
  }
  if (typeof availableScopes === "string") {
    availableScopes = (await import(/* @vite-ignore */ availableScopes))
      .default as AvailableScopes;
  }

  const server = new Server(evaluatorMaker, availableScopes);

  postMessage(["loaded"]);

  if (onmessage) {
    console.error("onmessage 已被占用，");
  }
  onmessage = (ev) => server.handle(ev.data as DataToWorker);
}
