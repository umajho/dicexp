import { errorAsErrorData } from "../error_from_worker";
import { DataFromWorker } from "./types";

declare function postMessage(data: DataFromWorker): void;

export function tryPostMessage(data: DataFromWorker): void {
  if (data[0] === "evaluate_result") {
    if (data[2].error) {
      data[3] = errorAsErrorData(data[2].error);
      // @ts-ignore
      delete data[2].error;
    }
  } else if (data[0] === "batch_report") {
    if (data[2].error) {
      data[4] = errorAsErrorData(data[2].error);
      delete data[2].error;
    }
  }
  try {
    postMessage(data);
  } catch (e) {
    const errorMessage = (e instanceof Error) ? e.message : `${e}`;
    postMessage(["fatal", "无法发送消息：" + errorMessage]);
  }
}
