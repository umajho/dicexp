export { parse } from "./parse";

export type {
  ParseOptions, // `parse` 的选项
  ParseResult, // `parse` 返回的结果
} from "./parse";
export type {
  Node, // `ParseResult` 在 "ok" 时对应的结果
} from "@dicexp/nodes";
export type {
  ParseError, // `ParseResult` 在 "error" 时对应的结果
} from "./parse_error";
