import { Representation, RuntimeRepresentation } from "./types";

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
