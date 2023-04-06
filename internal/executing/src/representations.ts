import { Unreachable } from "@dicexp/errors";
import type { RegularCallStyle, ValueCallStyle } from "@dicexp/nodes";
import type { RuntimeError } from "./runtime_errors";
import { intersperse } from "./utils";
import type { LazyValue, RuntimeResult, Value } from "./values";

// TODO: details/summary
export type RuntimeRepresentation = (
  | string
  | { error: string }
  | RuntimeRepresentation
  | { defer: () => RuntimeRepresentation }
)[];

export type Representation = (
  | string
  | { error: string }
)[];

export function finalizeRepresentation(
  r: RuntimeRepresentation,
): Representation {
  const flatten = r.flatMap((piece) => {
    if (typeof piece === "string") return piece;
    if (Array.isArray(piece)) return finalizeRepresentation(piece);
    if ("error" in piece) return piece;
    return finalizeRepresentation(piece.defer());
  });

  const merged: Representation = [];
  for (const piece of flatten) {
    const last = merged.length ? merged[merged.length - 1] : null;
    if (typeof last === "string" && typeof piece === "string") {
      merged[merged.length - 1] = last + piece;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}

export function representLazyValue(
  lazyValue: LazyValue,
): RuntimeRepresentation {
  if (lazyValue.replacedBy) {
    return representLazyValue(lazyValue.replacedBy);
  }
  if (lazyValue.stabilizedAs?.length === 1) {
    return lazyValue.stabilizedAs[0].representation;
  }
  if (!lazyValue.memo) {
    return ["?"];
  }
  return lazyValue.memo.representation;
}

export function representResult(
  r: RuntimeResult<Value>,
): RuntimeRepresentation {
  if ("ok" in r) return representValue(r.ok);
  return representError(r.error);
}

export function representError(error: RuntimeError): RuntimeRepresentation {
  return [{ error: error.message }];
}

export function representValue(value: Value): RuntimeRepresentation {
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return ["[", ...representListElements(value), "]"];
  }
  // callable
  return value.representation;
}

function representListElements(elements: LazyValue[]): RuntimeRepresentation {
  return [{
    defer: () => {
      const elemReps = elements.map((el) => representLazyValue(el));
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
  args: LazyValue[],
  kind: "regular" | "value",
  style: RegularCallStyle | ValueCallStyle,
): RuntimeRepresentation {
  return [{
    defer: () => {
      if (style === "operator") {
        if (args.length === 1) {
          const leftRepresentation = representLazyValue(args[0]);
          return ["(", callee, leftRepresentation, ")"];
        }
        if (args.length === 2) {
          const leftRepresentation = representLazyValue(args[0]);
          const rightRepresentation = representLazyValue(args[1]);
          return ["(", leftRepresentation, callee, rightRepresentation, ")"];
        }
        throw new Unreachable();
      }

      const r: RuntimeRepresentation = [];
      if (style === "piped") {
        r.push("(", representLazyValue(args[0]), " |> ");
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
