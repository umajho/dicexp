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

export function flatten<A>(arr: A, depth?: number): unknown[];
export function flatten(arr: any, depth = 1) {
  const result = [];
  for (let sub of arr) {
    if (Array.isArray(sub)) {
      if (depth !== 1) {
        sub = flatten(sub, depth - 1);
      }
      result.push(...sub);
    } else {
      result.push(sub);
    }
  }
  return result;
}
