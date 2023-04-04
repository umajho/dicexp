import { RuntimeError } from "@dicexp/executing";
import { ParsingError } from "@dicexp/parsing";
import { EvaluatingSpecialErrorType } from "./types";

export function getEvaluatingErrorType(
  error: Error | undefined,
): EvaluatingSpecialErrorType | null {
  if (!error) return null;
  if (error instanceof ParsingError) return "parsing_error";
  if (error instanceof RuntimeError) return "runtime_error";
  return null;
}

// export type PackedError =
//   | [error_type: "parsing" | "runtime", data: unknown]
//   | [error_type: "other", error: Error];

// export function packError(error: Error | undefined): PackedError | null {
//   if (!error) return null;
//   if (error instanceof ParsingError) {
//     return ["parsing", JSON.stringify(error)];
//   } else if (error instanceof RuntimeError) {
//     return ["runtime", JSON.stringify(error)];
//   }
//   return ["other", error];
// }

// export function unpackError(error: PackedError): Error {
// }
