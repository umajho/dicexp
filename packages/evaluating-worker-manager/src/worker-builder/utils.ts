export function safe<T extends ({ error: Error } | {})>(
  cb: () => T,
): T | ["error", Error] {
  try {
    return cb();
  } catch (e) {
    if (!(e instanceof Error)) {
      e = new Error(`未知抛出：${e}`);
    }
    return ["error", e as Error];
  }
}
