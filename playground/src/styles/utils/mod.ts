export function mountStyle(style: string, opts: { id: string }) {
  if (!document.getElementById(opts.id)) {
    const styleEl = document.createElement("style");
    styleEl.id = opts.id;
    document.head.append(styleEl);
  }

  const styleEl = document.getElementById(opts.id)!;
  if (styleEl.innerText !== style) {
    styleEl.innerText = style;
  }
}
