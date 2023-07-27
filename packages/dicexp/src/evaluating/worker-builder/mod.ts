import { Scope } from "@dicexp/runtime/values";

import { Server } from "./server";
import { DataToWorker } from "./types";

export function startWorkerServer<
  AvailableScopes extends Record<string, Scope>,
>(availableScopes: AvailableScopes) {
  const server = new Server(availableScopes);

  if (onmessage) {
    console.error("onmessage 已被占用，");
  }
  onmessage = (ev) => {
    server.handle(ev.data as DataToWorker<AvailableScopes>);
  };
}
