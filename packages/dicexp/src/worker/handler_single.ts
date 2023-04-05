import { evaluate, EvaluateOptions } from "../evaluate";
import { DataFromWorker } from "./types";
import { safe } from "./utils";

export function handleEvaluate(
  id: string,
  code: string,
  opts?: EvaluateOptions,
): DataFromWorker {
  const result = safe(() => evaluate(code, opts));
  return ["evaluate_result", id, result, null];
}
