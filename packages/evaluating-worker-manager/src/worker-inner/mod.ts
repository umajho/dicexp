import type { Scope } from "@dicexp/runtime/scopes";

import { Dicexp, setDicexp } from "./dicexp";
import { Server } from "./server";
import { DataToWorker } from "./types";

export async function startWorkerServer<
  AvailableScopes extends Record<string, Scope>,
>(dicexp: Dicexp | string, availableScopes: AvailableScopes | string) {
  if (typeof dicexp === "string") {
    dicexp = (await import(/* @vite-ignore */ dicexp)).default as Dicexp;
  }
  if (typeof availableScopes === "string") {
    availableScopes = (await import(/* @vite-ignore */ availableScopes))
      .default as AvailableScopes;
  }

  setDicexp(dicexp);
  const server = new Server(availableScopes);

  postMessage(["loaded"]);

  if (onmessage) {
    console.error("onmessage 已被占用，");
  }
  onmessage = (ev) => {
    server.handle(ev.data as DataToWorker<AvailableScopes>);
  };
}
