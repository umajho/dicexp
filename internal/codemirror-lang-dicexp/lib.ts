import { parser } from "@dicexp/lezer";

import { LanguageSupport, LRLanguage } from "@codemirror/language";

export const dicexpLanguage = LRLanguage.define({
  parser,
});

export function dicexp() {
  return new LanguageSupport(dicexpLanguage);
}
