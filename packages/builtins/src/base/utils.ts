export function sum(arr: number[]) {
  if (arr.length === 0) return 0;
  return arr.reduce((acc, cur) => acc + cur);
}

export function product(arr: number[]) {
  if (arr.length === 0) return 1;
  return arr.reduce((acc, cur) => acc * cur);
}
