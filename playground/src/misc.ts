export type ErrorType =
  | "parse"
  | "runtime"
  | "sampling"
  | "worker_client"
  | "other";

export type ErrorWithType = Error & { type: ErrorType };

export function getErrorDisplayInfo(
  errorType?: ErrorType,
) {
  switch (errorType) {
    case "parse":
      return { kind: "解析", showsStack: false };
    case "runtime":
    case "sampling":
      return { kind: "运行时", showsStack: false };
    case "worker_client":
      return { kind: "Worker 客户端", showsStack: false };
    case "other":
    default:
      return { kind: "", showsStack: true };
  }
}
