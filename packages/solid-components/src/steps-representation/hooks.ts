/**
 * 保证只有一处被设为 true。
 */
export function createUniqueTrueSetter() {
  let lastSetterFn: ((v: boolean) => void) | null = null;
  return function (
    setterFn: (v: boolean) => void,
    action: "setTrue" | "setFalse",
  ) {
    if (action === "setTrue") {
      if (lastSetterFn === setterFn) {
        lastSetterFn(true);
        return;
      }
      lastSetterFn?.(false);
      setterFn(true);
      lastSetterFn = setterFn;
    } else if (action === "setFalse") {
      if (lastSetterFn !== setterFn) return;
      lastSetterFn(false);
      lastSetterFn = null;
    }
  };
}
