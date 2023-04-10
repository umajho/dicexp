import { ExternalTokenizer } from "@lezer/lr";

import { identifier, keywordD } from "./dicexp.grammar.term";

// 参见：https://unicode.org/reports/tr31/
// 另可参考：https://hexdocs.pm/elixir/1.12.3/unicode-syntax.html
const identifierStart = /[\p{ID_Start}_]/u;
const identifierContinue = /\p{ID_Continue}/u; // "_" 在里边

const code_d = "d".charCodeAt(0);
const code_0 = "0".charCodeAt(0);
const code_9 = "9".charCodeAt(0);
const code_qm = "?".charCodeAt(0);

export const identifierTokenizer = new ExternalTokenizer((input, _stack) => {
  if (input.next === -1) return;
  const first = input.next;

  if (first === code_d) {
    input.advance();
    if (input.next >= code_0 && input.next <= code_9) {
      input.acceptToken(keywordD); // 投骰子的 “d” 运算符
      return;
    }
  } else {
    if (!identifierStart.test(String.fromCharCode(first))) return;
    input.advance();
  }

  let singleChar = true;
  while (
    input.next !== -1 &&
    identifierContinue.test(String.fromCharCode(input.next))
  ) {
    input.advance();
    singleChar = false;
  }

  if (input.next === code_qm) { // 允许以 “?” 结尾
    input.advance();
    singleChar = false;
  }

  if (singleChar && first === code_d) {
    input.acceptToken(keywordD); // 投骰子的 “d” 运算符
  } else {
    input.acceptToken(identifier);
  }
}, { contextual: true, fallback: true });
