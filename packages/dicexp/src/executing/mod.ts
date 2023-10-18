export { execute } from "./execute";

export type {
  ExecuteOptions, // `execute` 的选项
  ExecutionResult, // `execute` 返回的结果
} from "./execute";
export type {
  ExecutionAppendix, // `ExecutionResult` 在 "ok" 及 "error" 时对应的结果的第二项
  JSValue, // `ExecutionResult` 在 "ok" 时对应的结果的第一项
  Statistics, // `ExecutionResult` 中的一项
} from "./runtime";
export type {
  Restrictions as RuntimeRestrictions, // `ExecutionResult` 中的一项
} from "./restrictions";
export {
  type Repr, // `ExecutionResult` 中的一项
  type RuntimeError, // `ExecutionResult` 在 "error" 时对应的结果的第一项
} from "@dicexp/runtime/values";

export { asRuntimeError } from "@dicexp/runtime/values";
export { asScope } from "@dicexp/runtime/regular-functions";
