import { Unreachable } from "@dicexp/errors";
import { RuntimeError } from "./runtime_values/mod";
import type { ValueTypeName } from "./values_impl";

export class RuntimeError_LimitationExceeded extends RuntimeError {
  constructor(
    readonly name: string,
    readonly unit: string | null,
    readonly max: number,
  ) {
    super();
  }

  get message() {
    const unit = this.unit ? " " + this.unit : "";
    return `越过内在限制「${this.name}」（允许 ${this.max}${unit}）`;
  }
}

export class RuntimeError_RestrictionExceeded extends RuntimeError {
  constructor(
    readonly name: string,
    readonly unit: string | null,
    readonly max: number,
  ) {
    super();
  }

  get message() {
    const unit = this.unit ? " " + this.unit : "";
    return `越过外加限制「${this.name}」（允许 ${this.max}${unit}）`;
  }
}

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
  readonly expectedType: ValueTypeName[];
  readonly actualType: ValueTypeName;
  readonly kind: null | "list-inconsistency";

  constructor(
    expectedType: ValueTypeName | ValueTypeName[],
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
  readonly expectedType: ValueTypeName[];
  readonly actualType: ValueTypeName;

  constructor(
    position: number,
    expectedType: ValueTypeName | ValueTypeName[],
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
export class RuntimeError_UnknownRegularFunction extends RuntimeError {
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  get message() {
    return `名为 \`${this.name}\` 的通常函数并不存在`;
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

export class RuntimeError_ValueIsNotCallable extends RuntimeError {
  get message() {
    return `尝试调用不可被调用的值`;
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

export function getTypeDisplayName(name: ValueTypeName) {
  switch (name) {
    case "number":
      return "整数";
    case "boolean":
      return "布尔";
    case "list":
      return "列表";
    // case "closure":
    //   return "匿名函数";
    // case "captured":
    //   return "被捕获的通常函数";
    case "callable":
      return "可调用的";
    default:
      return `【内部实现泄漏】未知（${name}）`;
  }
}
