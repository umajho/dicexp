import { Unreachable } from "./errors";

import { type Node_Value, value } from "@dicexp/nodes";

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
    sourceString = sourceString.replace("_", "");
  }
  const int = parseInt(sourceString);
  if (int < Number.MIN_SAFE_INTEGER) {
    // TODO: throw error
    return value(-Infinity);
  } else if (int > Number.MAX_SAFE_INTEGER) {
    // TODO: throw error
    return value(Infinity);
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
