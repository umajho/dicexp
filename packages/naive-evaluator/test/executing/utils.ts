export function flatten<A>(arr: A, depth?: number): unknown[];
export function flatten(arr: any, depth = 1) {
  const result: any[] = [];
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
