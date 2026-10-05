/**
 * Shared, implementation-agnostic semantic test suites (see
 * `nova/docs/plan.md` §9). The factories register `describe`/`it` blocks;
 * consumers pass a context describing how to build their testers.
 */
export type {
  DivergenceTag,
  ImplTag,
  ParseResultForTest,
  ParsingSuiteContext,
  PerImpl,
  RowMeta,
  SuiteContext,
} from "./context";
export { itTagged, forImpl } from "./context";
export type { OkCase, OkCaseObject } from "./rows";
export { theyAreOk, expectedRuntimeErrorFor } from "./rows";
export type {
  ParsingBadCase,
  ParsingOkCase,
  ParsingOkCaseObject,
  ParsingOkExpectation,
} from "./parsing";
export { defineParsingSuite } from "./parsing";
export { defineExecutingSuite } from "./executing";
export { defineBaseFunctionsSuite } from "./base-functions";
export type {
  BinaryTypeMismatchCase,
  BinaryTypeMismatchCaseObject,
  OperatorCallOutcome,
} from "./base-operators";
export {
  binaryOperatorOnlyAcceptsBoolean,
  binaryOperatorOnlyAcceptsNumbers,
  defineBaseOperatorsSuite,
  unaryOperatorOnlyAcceptsBoolean,
  unaryOperatorOnlyAcceptsNumbers,
} from "./base-operators";
