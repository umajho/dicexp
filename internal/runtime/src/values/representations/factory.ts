import { Unreachable } from "@dicexp/errors";
import { RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import { intersperse } from "@dicexp/js-utils";

import { RuntimeError } from "../runtime_errors";
import { asPlain, Value, ValueBox } from "../values";
import { RuntimeRepresentation } from "./types";

export function representError(error: RuntimeError): RuntimeRepresentation {
  return [{ error: error.message }];
}

export function representValue(value: Value): RuntimeRepresentation {
  value = asPlain(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return ["[", ...representListElements(value), "]"];
  }
  // callable
  return value.representation;
}

function representListElements(elements: ValueBox[]): RuntimeRepresentation {
  return [{
    defer: () => {
      const elemReps = elements.map((el) => el.getRepresentation());
      return intersperse(elemReps, [","]);
    },
  }];
}

export function representCaptured(
  identifier: string,
  arity: number,
): RuntimeRepresentation {
  return ["&", identifier, `/${arity}`];
}

export function representCall(
  callee: RuntimeRepresentation,
  args_: ValueBox[],
  kind: "regular" | "value",
  style: RegularCallStyle | ValueCallStyle,
): RuntimeRepresentation {
  return [{
    defer: () => {
      let args = args_;

      if (style === "operator") {
        if (args.length === 1) {
          const leftRepresentation = args[0].getRepresentation();
          return ["(", callee, leftRepresentation, ")"];
        }
        if (args.length === 2) {
          const leftRepresentation = args[0].getRepresentation();
          const rightRepresentation = args[1].getRepresentation();
          return ["(", leftRepresentation, callee, rightRepresentation, ")"];
        }
        throw new Unreachable();
      }

      const r: RuntimeRepresentation = [];
      if (style === "piped") {
        r.push("(", args[0].getRepresentation(), " |> ");
        args = args.slice(1);
      }
      r.push(...callee);
      if (kind === "value") {
        r.push(".");
      }
      // TODO: 也许可以附上 label
      r.push("(", ...representListElements(args), ")");
      if (style === "piped") {
        r.push(")");
      }
      return r;
    },
  }];
}

export function representRepetition(
  count: ValueBox,
  bodyRaw: string,
): RuntimeRepresentation {
  return [{
    defer: () => {
      return ["(", count.getRepresentation(), "#", bodyRaw, ")"];
    },
  }];
}
