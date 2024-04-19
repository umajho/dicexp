import type * as I from "@dicexp/interface";

export interface Range {
  from: number;
  to: number;
}

export interface ParseError extends I.ParseError {}

export const createParseError = {
  generalGrammar(source: string, ranges: Range[]): ParseError {
    let message = "以下位置的语法有误：";
    for (const range of ranges) {
      message += "\n\t";
      const s = source.slice(range.from - 1, range.to);
      message += `自列 ${range.from} 至列 ${range.to}：${s}`;
    }
    return { message };
  },

  badPipeTarget(): ParseError {
    return { message: "管道运算符右侧无法传入参数" };
  },

  badIntegerLiteral(source: string): ParseError {
    return {
      message: `整数字面量 ${source} ` +
        `在整数的安全范围（${Number.MIN_SAFE_INTEGER} 至 ${Number.MAX_SAFE_INTEGER}）之外`,
    };
  },
};
