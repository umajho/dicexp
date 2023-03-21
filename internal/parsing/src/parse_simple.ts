import { Node, regularCall } from "@dicexp/nodes";
import { parseInteger } from "./utils";

/**
 * 快速处理形如 `d10 ~ 3d8+10` 这样最基本的表达式。
 * @param code
 * @returns
 */
export function simpleParse(code: string): Node | false {
  if (!/^([-+#~d\s]|\d[_\d]*)+$/.test(code)) return false;
  code = code.replace(/[\s_]+/g, "");
  if (/[-+]{2}/.test(code)) return false;

  return simpleParse_repeat(code);
}

function simpleParse_repeat(side: string): Node | false {
  return simpleParseOperatorExp(side, "#", simpleParse_range, false);
}

function simpleParse_range(side: string): Node | false {
  return simpleParseOperatorExp(side, "~", simpleParse_adds_subs, true);
}

function simpleParse_adds_subs(side: string): Node | false {
  let node: Node | null = null;

  let recognized = 0;
  for (const [full, op, die] of side.matchAll(/([-+]?)([^-+]+)/g)) {
    recognized += full.length;

    const cur = simpleParseOperatorExp(die, "d", parseInteger, true);
    if (!cur) return false;

    if (!node) {
      if (op) {
        node = regularCall("operator", op, [cur]);
      } else {
        node = cur;
      }
    } else {
      if (!op) return false;
      node = regularCall("operator", op, [node, cur]);
    }
  }
  if (recognized != side.length || !node) return false;
  return node;
}

function simpleParseOperatorExp(
  exp: string,
  op: string,
  parseInner: (inner: string) => Node | false,
  allowsUnary: boolean,
): Node | false {
  const [l, r, rest] = exp.split(op);
  if (rest !== undefined) return false; // 多个 op
  if (r === undefined) { // 没有运算符
    if (l === "") return false; // exp 完全是空的
    return parseInner(l);
  } else { // <left>? <op> <right>
    if (r === "") return false; // <left> <op>
    const parsedR = parseInner(r);
    if (!parsedR) return false;
    if (l === "") { // <op> <right>
      if (!allowsUnary) return false;
      return regularCall("operator", op, [parsedR]);
    } else { // <left> <op> <right>
      const parsedL = parseInner(l);
      if (!parsedL) return false;
      return regularCall("operator", op, [parsedL, parsedR]);
    }
  }
}
