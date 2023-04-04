import type { DataToWorker } from "./types";
import { Server } from "./server";

let server: Server | null = null;

async function handle(data: DataToWorker): Promise<void> {
  const dataToWorkerType = data[0];
  if (dataToWorkerType === "initialize") {
    if (server) {
      const error = new Error("Worker 重复初始化");
      postMessage(["initialize_result", { error }]);
    }
    const init = data[1];
    server = new Server(init);
    postMessage(["initialize_result", { ok: true }]);
    return;
  }

  if (!server) {
    console.error("Worker 尚未初始化！");
    return;
  }
  server.handle(data);
}

onmessage = (ev) => {
  const data = ev.data as DataToWorker;
  handle(data);
};
