import { Unreachable } from "../../errors.ts";
import {
  ExpectedValueTypeName,
  getTypeDisplayName,
} from "./builtin_functions.ts";
import { ValueTypeName } from "./values.ts";

export class RuntimeError extends Error {}

export class RuntimeError_WrongArity extends RuntimeError {
  readonly expectedArity: number;
  readonly actualArity: number;

  constructor(
    expectedArity: number,
    actualArity: number,
  ) {
    super();
    this.expectedArity = expectedArity;
    this.actualArity = actualArity;
  }

  get message() {
    return `调用期待 ${this.expectedArity} 个参数，实际有 ${this.actualArity} 个参数`;
  }
}

export class RuntimeError_TypeMismatch extends RuntimeError {
  readonly expectedType: ExpectedValueTypeName[];
  readonly actualType: ValueTypeName;
  readonly kind: null | "list-inconsistency";

  constructor(
    expectedType: ExpectedValueTypeName | ExpectedValueTypeName[],
    actualType: ValueTypeName,
    kind: RuntimeError_TypeMismatch["kind"] = null,
  ) {
    super();
    this.expectedType = Array.isArray(expectedType)
      ? expectedType
      : [expectedType];
    this.actualType = actualType;
    this.kind = kind;
  }

  get message() {
    const expected = this.expectedType.map((x) =>
      `「${getTypeDisplayName(x)}」`
    ).join("");
    const kindText = (() => {
      if (!this.kind) return "";
      if (this.kind === "list-inconsistency") {
        return "（期待列表第一个元素的类型）";
      }
      throw new Unreachable();
    })();
    return `期待类型${expected}` +
      `与实际类型「${getTypeDisplayName(this.actualType)}」不符` +
      kindText;
  }
}

export class RuntimeError_CallArgumentTypeMismatch extends RuntimeError {
  readonly position: number;
  readonly expectedType: ExpectedValueTypeName[];
  readonly actualType: ValueTypeName;

  constructor(
    position: number,
    expectedType: ExpectedValueTypeName | ExpectedValueTypeName[],
    actualType: ValueTypeName,
  ) {
    super();
    this.position = position;
    this.expectedType = Array.isArray(expectedType)
      ? expectedType
      : [expectedType];
    this.actualType = actualType;
  }

  get message() {
    const expected = this.expectedType.map((x) =>
      `「${getTypeDisplayName(x)}」`
    ).join("");
    return `调用的第 ${this.position} 个参数类型不匹配：` +
      `期待类型${expected}` +
      `与实际类型「${getTypeDisplayName(this.actualType)}」不符`;
  }
}

export class RuntimeError_IllegalOperation extends RuntimeError {
  readonly operation: string;
  readonly reason: string;

  constructor(operation: string, reason: string) {
    super();
    this.operation = operation;
    this.reason = reason;
  }

  get message() {
    return `操作 “${this.operation}” 非法：${this.reason}`;
  }
}

// TODO: 给出可能的推荐，比如同名不同 arity 或名称相似的标识符。
//       也许可以用 `npm:string-similarity`
export class RuntimeError_UnknownFunction extends RuntimeError {
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  get message() {
    return `名为 \`${this.name}\` 的函数并不存在`;
  }
}

// TODO: 给出可能的推荐，比如同名不同 arity 或名称相似的标识符。
//       也许可以用 `npm:string-similarity`
export class RuntimeError_UnknownVariable extends RuntimeError {
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  get message() {
    return `名为 \`${this.name}\` 的变量并不存在`;
  }
}

export class RuntimeError_NotCallable extends RuntimeError {
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  get message() {
    return `\`${this.name}\` 不可调用`;
  }
}

export class RuntimeError_DuplicateClosureParameterNames extends RuntimeError {
  readonly duplicateName: string;

  constructor(name: string) {
    super();
    this.duplicateName = name;
  }

  get messsage() {
    return `匿名函数存在重复的参数名 ${this.duplicateName}`;
  }
}

export class RuntimeError_BadFinalResult extends RuntimeError {
  readonly typeName: ValueTypeName;

  constructor(typeName: ValueTypeName) {
    super();
    this.typeName = typeName;
  }

  get message() {
    return `「${getTypeDisplayName(this.typeName)}」不能作为最终结果`;
  }
}
