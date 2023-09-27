/**
 * 让 className 只能是唯一一个元素的 class。
 */
export function createUniqueClassMarker(className: string) {
  let lastEl: HTMLElement | null = null;
  return function (el: HTMLElement, action: "add" | "remove") {
    if (action === "add") {
      if (lastEl === el) return;
      lastEl?.classList.remove(className);
      el.classList.add(className);
      lastEl = el;
    } else if (action === "remove") {
      if (lastEl !== el) return;
      el.classList.remove(className);
      lastEl = null;
    }
  };
}
