export function intersperse<T>(arr: T[], sep: T): T[] {
  const result: T[] = Array(arr.length * 2 - 1);
  for (const [i, el] of arr.entries()) {
    result[i * 2] = el;
    if (i !== arr.length - 1) {
      result[i * 2 + 1] = sep;
    }
  }
  return result;
}

export function flatten<T>(arr: T[][]): T[] {
  const flatten: T[] = [];
  for (const sub of arr) {
    flatten.push(...sub);
  }
  return flatten;
}
