export { execute, type ExecuteOptions, type ExecutionResult } from "./execute";
export type { ExecutionAppendix, JSValue } from "./runtime";
export type { Restrictions as RuntimeRestrictions } from "./restrictions";
export {
  asRuntimeError,
  type Repr,
  type RuntimeError,
} from "@dicexp/runtime/values";
export { asScope } from "@dicexp/runtime/regular-functions";
