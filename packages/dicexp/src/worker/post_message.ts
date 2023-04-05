import { DataFromWorker } from "./types";

declare function postMessage(data: DataFromWorker): void;

export function tryPostMessage(data: DataFromWorker): void {
  try {
    postMessage(data);
  } catch (e) {
    const errorMessage = (e instanceof Error) ? e.message : `${e}`;
    postMessage(["fatal", "无法发送消息：" + errorMessage]);
  }
}
