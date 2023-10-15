export default function createWorkerConstructor(
  workerCode: string,
  workerOpts: WorkerOptions,
) {
  let blob = new Blob([workerCode], { type: "text/javascript;charset=utf-8" });

  return new Proxy(Worker, {
    construct(target, _args, newTarget) {
      const url = URL.createObjectURL(blob);
      const worker = Reflect.construct(target, [url, workerOpts], newTarget);
      URL.revokeObjectURL(url);
      return worker;
    },
  });
}
