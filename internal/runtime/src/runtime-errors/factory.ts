import { Unreachable } from "@dicexp/errors";

import { getTypeDisplayName, ValueTypeName } from "../values/mod";

import { RuntimeError } from "./RuntimeError";

export const createRuntimeError = {
  simple(message: string): RuntimeError {
    return { type: "error", message };
  },

  limitationExceeded(
    name: string,
    unit: string | null,
    max: number,
  ): RuntimeError {
    unit = unit ? " " + unit : "";
    return createRuntimeError.simple(
      `越过内在限制「${name}」（允许 ${max}${unit}）`,
    );
  },

  restrictionExceeded(
    name: string,
    unit: string | null,
    max: number,
  ): RuntimeError {
    unit = unit ? " " + unit : "";
    return createRuntimeError.simple(
      `越过外加限制「${name}」（允许 ${max}${unit}）`,
    );
  },

  wrongArity(
    expectedArity: number,
    actualArity: number,
    kind: "regular" | "closure" | "captured",
  ): RuntimeError {
    const displayKind = kind === "regular"
      ? "通常函数"
      : (kind === "closure" ? "闭包" : "被捕获的通常函数");

    return createRuntimeError.simple(
      `尝试调用的${displayKind}期待 ${expectedArity} 个参数，` +
        `实际有 ${actualArity} 个参数`,
    );
  },

  typeMismatch(
    expectedType_: ValueTypeName | Set<ValueTypeName>,
    actualType: ValueTypeName,
    kind: TypeMismatchKind = null,
  ): RuntimeError {
    const expectedType = expectedTypeArray(expectedType_);

    const expected = expectedType.map((x) => `「${getTypeDisplayName(x)}」`)
      .join(
        "",
      );
    const kindText = (() => {
      if (!kind) return "";
      if (kind === "list-inconsistency") {
        return "（期待列表第一个元素的类型）";
      }
      throw new Unreachable();
    })();
    return createRuntimeError.simple(
      `期待类型${expected}` +
        `与实际类型「${getTypeDisplayName(actualType)}」不符` +
        kindText,
    );
  },

  callArgumentTypeMismatch(
    position: number,
    expectedType_: ValueTypeName | Set<ValueTypeName>,
    actualType: ValueTypeName,
  ): RuntimeError {
    const expectedType = expectedTypeArray(expectedType_);

    const expected = expectedType.map((x) => `「${getTypeDisplayName(x)}」`)
      .join(
        "",
      );
    return createRuntimeError.simple(
      `调用的第 ${position} 个参数类型不匹配：` +
        `期待类型${expected}` +
        `与实际类型「${getTypeDisplayName(actualType)}」不符`,
    );
  },

  unknownRegularFunction(
    name: string,
  ): RuntimeError {
    return createRuntimeError.simple(`名为 \`${name}\` 的通常函数并不存在`);
  },

  unknownVariable(
    name: string,
  ): RuntimeError {
    return createRuntimeError.simple(`名为 \`${name}\` 的变量并不存在`);
  },

  valueIsNotCallable() {
    return createRuntimeError.simple(`尝试调用不可被调用的值`);
  },

  duplicateClosureParameterNames(
    name: string,
  ): RuntimeError {
    return createRuntimeError.simple(`匿名函数存在重复的参数名 ${name}`);
  },

  badFinalResult(
    typeName: ValueTypeName,
  ): RuntimeError {
    return createRuntimeError.simple(
      `「${getTypeDisplayName(typeName)}」不能作为最终结果`,
    );
  },
};

export type TypeMismatchKind = null | "list-inconsistency";

function expectedTypeArray(
  expectedType_: ValueTypeName | Set<ValueTypeName>,
): ValueTypeName[] {
  return expectedType_ instanceof Set ? [...expectedType_] : [expectedType_];
}
