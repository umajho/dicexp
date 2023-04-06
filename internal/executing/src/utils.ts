export function intersperse<T>(arr: T[], sep: T): T[] {
  if (!arr.length) return [];
  const result: T[] = Array(arr.length * 2 - 1);
  for (const [i, el] of arr.entries()) {
    result[i * 2] = el;
    if (i !== arr.length - 1) {
      result[i * 2 + 1] = sep;
    }
  }
  return result;
}
