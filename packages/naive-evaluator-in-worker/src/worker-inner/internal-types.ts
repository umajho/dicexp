import type * as I from "@dicexp/interface";
import { EvaluationResult, Evaluator } from "@dicexp/naive-evaluator";

/**
 * XXX: 如果直接使用 "@dicexp/naive-evaluator" 中的 Evaluator 而不用这里的类型，
 * 会导致外边在调用 startWorkerServer 时 tsc 报类型错误，表示期待的 Evaluator 与
 * 传入的 Evaluator 之间私有属性的声明不同。
 */
export interface NaiveEvaluator extends I.Evaluator {
  evaluate(code: string, opts: I.EvaluationOptions): EvaluationResult;
}
((x: Evaluator): NaiveEvaluator => x);
