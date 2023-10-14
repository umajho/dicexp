import Worker from "./container.worker?worker";

export function createWorkerByImportURLs(
  dicexpImportURL: string,
  scopesImportURL: string,
): Worker {
  const worker = new Worker();
  worker.postMessage([dicexpImportURL, scopesImportURL]);
  return worker;
}
