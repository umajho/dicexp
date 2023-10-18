export { parse } from "./parse";

export type {
  ParseOptions, // `parse` 的选项
  ParsingResult, // `parse` 返回的结果
} from "./parse";
export type {
  Node, // `ParsingResult` 在 "ok" 时对应的结果
} from "@dicexp/nodes";
export type {
  ParsingError, // `ParsingResult` 在 "error" 时对应的结果
} from "./parsing_error";
