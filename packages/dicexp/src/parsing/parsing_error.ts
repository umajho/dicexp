export interface Range {
  from: number;
  to: number;
}

export class ParsingError extends Error {}

export class ParsingError_General extends ParsingError {
  constructor(
    readonly source: string,
    readonly ranges: Range[],
  ) {
    super();
  }

  get message() {
    let msg = "以下位置的语法有误：";
    for (const range of this.ranges) {
      msg += "\n\t";
      const s = this.source.slice(range.from - 1, range.to);
      msg += `自列 ${range.from} 至列 ${range.to}：${s}`;
    }
    return msg;
  }
}

export class ParsingError_BadPipeTarget extends ParsingError {
  message = "管道运算符右侧无法传入参数";
}

const MAX_SAFE_INTEGER = 2 ** 53 - 1;
const MIN_SAFE_INTEGER = -(2 ** 53) + 1;
export class ParsingError_BadIntegerLiteral extends ParsingError {
  constructor(
    readonly source: string,
  ) {
    super();
  }

  get message() {
    return `整数字面量 ${this.source} 在整数的安全范围（${MIN_SAFE_INTEGER} 至 ${MAX_SAFE_INTEGER}）之外`;
  }
}
