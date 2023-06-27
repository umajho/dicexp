import { ExternalTokenizer } from "@lezer/lr";

import {
  idBuiltin,
  idExternal,
  idIgnore,
  idUserDefined,
  keywordD,
} from "./dicexp.grammar.term";

// 参见：https://unicode.org/reports/tr31/
// 另可参考：https://hexdocs.pm/elixir/1.12.3/unicode-syntax.html
const identifierStart = /[\p{ID_Start}_]/u;
const identifierContinue = /\p{ID_Continue}/u; // "_" 在里边

const code_dollar = "$".charCodeAt(0);
const code_at = "@".charCodeAt(0);
const code_underscore = "_".charCodeAt(0);

const code_d = "d".charCodeAt(0);
const code_0 = "0".charCodeAt(0);
const code_9 = "9".charCodeAt(0);
const code_qm = "?".charCodeAt(0);

export const identifierTokenizer = new ExternalTokenizer((input, _stack) => {
  if (input.next === -1) return;
  let first = input.next;

  // 根据有无前缀以及前缀是什么来确定是哪种标识符
  let idToken = idBuiltin;
  if (first === code_dollar) { // `$(<...>)`
    idToken = idUserDefined;
  } else if (first === code_at) { // `@(<...>)`
    idToken = idExternal;
  }

  if (idToken !== idBuiltin) {
    // 去掉前缀
    input.advance();
    if (input.next === -1) return;
    first = input.next;

    if (
      idToken === idExternal &&
      (first === code_at || first === code_underscore)
    ) {
      /*
        `@@(<...>)` or `@_(<...>)`
          ^              ^
      */
      input.advance();
      if (input.next === -1) return;
      first = input.next;
    }
  }

  if (idToken === idBuiltin && first === code_d) {
    input.advance();
  } else {
    if (!identifierStart.test(String.fromCharCode(first))) return;
    input.advance();
  }

  let restCount = 0;
  let restIsNumber = true;
  let lastIsUnderscore = true; // 或者还没开始
  while (
    input.next !== -1 &&
    identifierContinue.test(String.fromCharCode(input.next))
  ) {
    restCount++;
    if (restIsNumber) {
      if (input.next < code_0 || input.next > code_9) {
        if (!lastIsUnderscore && input.next === code_underscore) {
          lastIsUnderscore = true;
        } else {
          restIsNumber = false;
        }
      } else {
        lastIsUnderscore = false;
      }
    }
    input.advance();
  }
  if (restCount > 0 && lastIsUnderscore) {
    restIsNumber = false;
  }

  if (input.next === code_qm) { // 允许以 “?” 结尾
    input.advance();
    restCount++;
  }

  if (idToken === idBuiltin && first === code_d && restIsNumber) {
    input.acceptToken(keywordD, -restCount); // 投骰子的 “d” 运算符
    return;
  }

  if (restCount === 0 && first === code_underscore) {
    if (idToken === idBuiltin) {
      input.acceptToken(idIgnore); // “_”
    }
    return; // 不允许 “$_” 和 “@_”
  }

  input.acceptToken(idToken);
}, { contextual: true, fallback: true });
