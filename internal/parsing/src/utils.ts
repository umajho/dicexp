import { Unreachable } from "./errors";

import { type Node_Value, value } from "@dicexp/nodes";
import { ParsingError_BadIntegerLiteral } from "./parsing_error";

// see: https://stackoverflow.com/q/20486551
export function convertTextToHalfWidth(text: string) {
  return text.replace(
    /[！-～]/g,
    (c) => String.fromCharCode(c.charCodeAt(0) - widthDelta),
  );
}

const widthDelta = "！".charCodeAt(0) - "!".charCodeAt(0);

export function parseInteger(sourceString: string, replacesDash = true) {
  if (replacesDash) {
    sourceString = sourceString.replace(/_/g, "");
  }
  const int = parseInt(sourceString);
  if (int < Number.MIN_SAFE_INTEGER || int > Number.MAX_SAFE_INTEGER) {
    throw new ParsingError_BadIntegerLiteral(sourceString);
  }
  return value(int);
}

export function negateInteger(target: Node_Value) {
  if (typeof target.value !== "number") throw new Unreachable();
  return value(-target.value);
}

export function parseBoolean(sourceString: string) {
  switch (sourceString) {
    case "true":
      return value(true);
    case "false":
      return value(false);
    default:
      throw new Unreachable();
  }
}
