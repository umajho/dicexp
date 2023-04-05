import { RuntimeError } from "@dicexp/executing";
import { ParsingError } from "@dicexp/parsing";

export interface ErrorDataFromWorker {
  message: string;
  stack?: string;

  specialType: EvaluatingSpecialErrorType | null;
}

export type EvaluatingSpecialErrorType = "parsing_error" | "runtime_error";

export function errorAsErrorData(error: Error): ErrorDataFromWorker {
  let specialType: EvaluatingSpecialErrorType | null = null;
  if (error instanceof ParsingError) {
    specialType = "parsing_error";
  } else if (error instanceof RuntimeError) {
    specialType = "runtime_error";
  }

  return {
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    specialType,
  };
}

export function proxyErrorFromWorker(data: ErrorDataFromWorker) {
  return new Proxy(new Error(data.message), {
    get: (target, prop, receiver) => {
      if (prop === "stack") {
        return data.stack;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
