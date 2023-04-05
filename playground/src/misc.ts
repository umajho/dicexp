export function getErrorDisplayInfo(
  specialErrorType?: "parsing_error" | "runtime_error",
) {
  switch (specialErrorType) {
    case "parsing_error":
      return { kind: "解析", showsStack: false };
    case "runtime_error":
      return { kind: "运行时", showsStack: false };
    default:
      return { kind: "其他", showsStack: true };
  }
}
