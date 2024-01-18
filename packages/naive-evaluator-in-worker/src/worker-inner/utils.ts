export function makeSendableError(
  err: { name?: string; message: string; stack?: string },
): Error {
  return { name: err.name ?? "Error", message: err.message, stack: err.stack };
}
