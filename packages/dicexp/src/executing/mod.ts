export { execute, type ExecuteOptions, type ExecutionResult } from "./execute";
export type { JSValue, Statistics as RuntimeStatistics } from "./runtime";
export type { Restrictions as RuntimeRestrictions } from "./restrictions";
export {
  asRuntimeError,
  type Representation,
  type RuntimeError,
} from "@dicexp/runtime/values";
export { asScope } from "@dicexp/runtime/regular-functions";
