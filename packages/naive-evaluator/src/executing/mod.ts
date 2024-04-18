export { execute } from "./execute";

export type {
  ExecutionOptions, // `execute` 的选项
  // `execute` 返回的结果。其内含的类型 `Repr` 已由 @dicexp/interface 包引出
  ExecutionResult,
} from "./execute";
export type {
  ExecutionAppendix, // `ExecutionResult` 在 "ok" 及 "error" 时对应的结果的第二项
  ExecutionStatistics, // `ExecutionResult` 中的一项
} from "./runtime";
export type {
  RuntimeError, // `ExecutionResult` 在 "error" 时对应的结果的第一项
} from "@dicexp/naive-evaluator-runtime/runtime-errors";

export { asScope } from "@dicexp/naive-evaluator-runtime/scopes";

export { RandomGenerator, type RandomSource } from "./random";
