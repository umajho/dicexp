import { EvaluationResult } from "../evaluate";
import { evaluateForWorker } from "./evaluate";
import { DataFromWorker, EvaluateOptionsForWorker } from "./types";
import { safe } from "./utils";

export function handleEvaluate(
  id: string,
  code: string,
  opts: EvaluateOptionsForWorker,
): DataFromWorker {
  const result = safe((): EvaluationResult => evaluateForWorker(code, opts));
  return ["evaluate_result", id, result, null];
}
