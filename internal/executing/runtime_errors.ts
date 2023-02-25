import { EvaluatedValueTypes, typeDisplayText } from "./evaluated_values.ts";

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
  expectedType: EvaluatedValueTypes[];
  actualType: EvaluatedValueTypes;

  constructor(
    expectedType: EvaluatedValueTypes | EvaluatedValueTypes[],
    actualType: EvaluatedValueTypes,
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
      `与实际类型「${typeDisplayText(this.actualType)}」不符。`;
  }
}

export class RuntimeError_IllegalOperation extends RuntimeError {
  operator: string;
  left: string;
  right: string;
  reason: string;

  constructor(operator: string, left: string, right: string, reason: string) {
    super();
    this.operator = operator;
    this.left = left;
    this.right = right;
    this.reason = reason;
  }

  get message() {
    return `操作 “${this.left} ${this.operator} ${this.right}” 非法：${this.reason}。`;
  }
}
