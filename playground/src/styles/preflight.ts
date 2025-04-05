import { createStyleProviderFromCSSText } from "@rolludejo/internal-web-shared/shadow-root";

import { mountStyle } from "./utils/mod";

import preflight from "./preflight.css?inline";

export const STYLE_TEXT = preflight;

export const ID = "preflight";

(() => mountStyle(STYLE_TEXT, { id: ID }))();

export function getStyleElement(): HTMLStyleElement {
  return document.getElementById(ID)! as HTMLStyleElement;
}

export const styleProvider = createStyleProviderFromCSSText(STYLE_TEXT);
