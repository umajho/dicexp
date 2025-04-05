import { createStyleProviderFromCSSText } from "@rolludejo/internal-web-shared/shadow-root";

import { mountStyle } from "./utils/mod";

import tailwind from "./tailwind.css?inline";

export const STYLE_TEXT = tailwind;

export const ID = "tailwind";

(() => mountStyle(STYLE_TEXT, { id: ID }))();

export function getStyleElement(): HTMLStyleElement {
  return document.getElementById(ID)! as HTMLStyleElement;
}

export const styleProvider = createStyleProviderFromCSSText(STYLE_TEXT);
