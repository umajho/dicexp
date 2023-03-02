import { typeDisplayText, ValueTypeName } from "./values.ts";

export class RuntimeError extends Error {}

export class RuntimeError_WrongArity extends RuntimeError {
  functionName: string;
  expectedArity: number;
  actualArity: number;

  constructor(
    functionName: string,
    expectedArity: number,
    actualArity: number,
  ) {
    super();
    this.functionName = functionName;
    this.expectedArity = expectedArity;
    this.actualArity = actualArity;
  }
}

/**
 * FIXME: 应该把实际值也包含上。
 */
export class RuntimeError_TypeMismatch extends RuntimeError {
  expectedType: ValueTypeName[];
  actualType: ValueTypeName;

  constructor(
    expectedType: ValueTypeName | ValueTypeName[],
    actualType: ValueTypeName,
  ) {
    super();
    this.expectedType = Array.isArray(expectedType)
      ? expectedType
      : [expectedType];
    this.actualType = actualType;
  }

  get message() {
    const expected = this.expectedType.map((x) => `「${typeDisplayText(x)}」`);
    return `期待类型${expected}` +
      `与实际类型「${typeDisplayText(this.actualType)}」不符`;
  }
}

export class RuntimeError_IllegalOperation extends RuntimeError {
  operation: string;
  reason: string;

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
  name: string;

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
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  get message() {
    return `名为 \`${this.name}\` 的变量并不存在`;
  }
}

export class RuntimeError_NotCallable extends RuntimeError {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  get message() {
    return `\`${this.name}\` 不可调用`;
  }
}

export class RuntimeError_DuplicateClosureParameterNames extends RuntimeError {
  duplicateName: string;

  constructor(name: string) {
    super();
    this.duplicateName = name;
  }

  get messsage() {
    return `匿名函数存在重复的参数名 ${this.duplicateName}`;
  }
}
