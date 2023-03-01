// see: https://stackoverflow.com/q/20486551
export function convertTextToHalfWidth(text: string) {
  return text.replaceAll(
    /[！-～]/g,
    (c) => String.fromCharCode(c.charCodeAt(0) - widthDelta),
  );
}

const widthDelta = "！".charCodeAt(0) - "!".charCodeAt(0);
