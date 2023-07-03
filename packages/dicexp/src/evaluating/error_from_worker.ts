import { asRuntimeError, RuntimeError } from "../executing/mod";
import { ParsingError } from "../parsing/mod";

export interface ErrorDataFromWorker {
  message: string;
  stack?: string;

  specialType: EvaluatingSpecialErrorType | null;
}

export type EvaluatingSpecialErrorType = "parsing_error" | "runtime_error";

export function errorAsErrorData(
  error: Error | RuntimeError,
): ErrorDataFromWorker {
  let specialType: EvaluatingSpecialErrorType | null = null;
  if (error instanceof ParsingError) {
    specialType = "parsing_error";
  } else if (asRuntimeError(error)) {
    specialType = "runtime_error";
  }

  return {
    message: error.message,
    ...("stack" in error ? { stack: error.stack } : {}),
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
