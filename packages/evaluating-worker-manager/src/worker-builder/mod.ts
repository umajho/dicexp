import type { Scope } from "@dicexp/runtime/values";

import { Dicexp, setDicexp } from "./dicexp";
import { Server } from "./server";
import { DataToWorker } from "./types";

export function startWorkerServer<
  AvailableScopes extends Record<string, Scope>,
>(dicexp: Dicexp, availableScopes: AvailableScopes) {
  setDicexp(dicexp);
  const server = new Server(availableScopes);

  if (onmessage) {
    console.error("onmessage 已被占用，");
  }
  onmessage = (ev) => {
    server.handle(ev.data as DataToWorker<AvailableScopes>);
  };
}
