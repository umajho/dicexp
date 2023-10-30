export interface RuntimeError {
  type: "error";

  message: string;
}

export function asRuntimeError(x: any): RuntimeError | null {
  if (x && typeof x === "object" && "type" in x && x.type === "error") {
    return x as RuntimeError;
  }
  return null;
}
