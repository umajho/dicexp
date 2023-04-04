import { evaluate, EvaluateOptions } from "../evaluate";
import { getEvaluatingErrorType } from "./data";
import { DataFromWorker } from "./types";
import { safe } from "./utils";

export function handleEvaluate(
  id: string,
  code: string,
  opts?: EvaluateOptions,
): DataFromWorker {
  const result = safe(() => evaluate(code, opts));
  const specialErrorType = getEvaluatingErrorType(result.error);
  if (specialErrorType) {
    result.error = new Error(result.error!.message);
  }
  return ["evaluate_result", id, result, specialErrorType];
}
