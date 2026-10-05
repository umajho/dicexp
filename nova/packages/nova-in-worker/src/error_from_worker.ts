export function proxyErrorFromWorker(
  data: { message: string; stack?: string },
): Error {
  return new Proxy(new Error(data.message), {
    get: (target, prop, receiver) => {
      if (prop === "stack") {
        return data.stack;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
