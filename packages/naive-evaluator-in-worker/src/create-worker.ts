// 不 `&inline` 的话，构建后的本包作为依赖被引入后，worker 文件不会被 vite 分析到，
// 从而导致错误。
import Worker from "./container.worker?worker&inline";

export function createWorkerByImportURLs(
  dicexpImportURL: string,
  topLevelScopeImportURL: string,
): Worker {
  const worker = new Worker();
  worker.postMessage([dicexpImportURL, topLevelScopeImportURL]);
  return worker;
}
