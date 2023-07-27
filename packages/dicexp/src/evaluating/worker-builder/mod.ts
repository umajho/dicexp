import { Server } from "./server";
import { DataToWorker } from "./types";

export function startWorkerServer() {
  const server = new Server();

  if (onmessage) {
    console.error("onmessage 已被占用，");
  }
  onmessage = (ev) => {
    server.handle(ev.data as DataToWorker);
  };
}
