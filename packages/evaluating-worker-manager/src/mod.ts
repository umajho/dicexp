export { EvaluatingWorkerManager } from "./worker_manager";
export type {
  EvaluateOptionsForEvaluatingWorker, //`EvaluatingWorkerManager` 部分方法的选项
  NewEvaluatingWorkerManagerOptions, // `EvaluatingWorkerManager` 构造器的选项
} from "./worker_manager";
export type {
  BatchReportForWorker, // `EvaluatingWorkerManager` 的 `batch` 方法传入的回调函数会传入的参数
  // `EvaluatingWorkerManager` 的 `evaluate` 方法异步返回的结果。
  // 其内含的类型 `EvaluationResult` 已由 dicexp 包引出。
  EvaluationResultForWorker,
} from "./types";
export type {
  BatchReport, // `BatchReportForWorker` 的一部分可能
  BatchResult, // `BatchReport` 在 "ok" 及 "stop" 时对应的第一项，在 ("error", "batch") 时对应的第二项
  BatchStatistics, // `BatchReport` 中紧随 `BatchResult` 之后的一项
  // `EvaluateOptionsForEvaluatingWorker` 基于的类型。
  // 其内含的类型 `ParseOptions` 已由 dicexp 包引出。
  EvaluateOptionsForWorker,
  EvaluationRestrictionsForWorker, // `EvaluateOptionsForWorker` 内含
  ExecutionOptionsForWorker, // `EvaluateOptionsForWorker` 内含
} from "./worker-inner/types";

export { startWorkerServer } from "./worker-inner/mod";
export type { Dicexp as DicexpEssenceForWorker } from "./worker-inner/dicexp";

export { createWorkerByImportURLs } from "./create-worker";
