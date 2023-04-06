import { Unreachable } from "@dicexp/errors";
import { makeRuntimeError, type RuntimeError } from "./runtime_values/mod";
import type { ValueTypeName } from "./values_impl";

export function runtimeError_limitationExceeded(
  name: string,
  unit: string | null,
  max: number,
): RuntimeError {
  unit = unit ? " " + unit : "";
  return makeRuntimeError(`越过内在限制「${name}」（允许 ${max}${unit}）`);
}

export function runtimeError_restrictionExceeded(
  name: string,
  unit: string | null,
  max: number,
): RuntimeError {
  unit = unit ? " " + unit : "";
  return makeRuntimeError(`越过外加限制「${name}」（允许 ${max}${unit}）`);
}

export function runtimeError_wrongArity(
  expectedArity: number,
  actualArity: number,
): RuntimeError {
  return makeRuntimeError(
    `调用期待 ${expectedArity} 个参数，实际有 ${actualArity} 个参数`,
  );
}

export type TypeMismatchKind = null | "list-inconsistency";

export function runtimeError_typeMismatch(
  expectedType: ValueTypeName | ValueTypeName[],
  actualType: ValueTypeName,
  kind: TypeMismatchKind = null,
): RuntimeError {
  expectedType = Array.isArray(expectedType) ? expectedType : [expectedType];

  const expected = expectedType.map((x) => `「${getTypeDisplayName(x)}」`).join(
    "",
  );
  const kindText = (() => {
    if (!kind) return "";
    if (kind === "list-inconsistency") {
      return "（期待列表第一个元素的类型）";
    }
    throw new Unreachable();
  })();
  return makeRuntimeError(
    `期待类型${expected}` +
      `与实际类型「${getTypeDisplayName(actualType)}」不符` +
      kindText,
  );
}

export function runtimeError_callArgumentTypeMismatch(
  position: number,
  expectedType: ValueTypeName | ValueTypeName[],
  actualType: ValueTypeName,
): RuntimeError {
  expectedType = Array.isArray(expectedType) ? expectedType : [expectedType];

  const expected = expectedType.map((x) => `「${getTypeDisplayName(x)}」`)
    .join("");
  return makeRuntimeError(
    `调用的第 ${position} 个参数类型不匹配：` +
      `期待类型${expected}` +
      `与实际类型「${getTypeDisplayName(actualType)}」不符`,
  );
}

export function runtimeError_illegalOperation(
  operation: string,
  reason: string,
): RuntimeError {
  return makeRuntimeError(`操作 “${operation}” 非法：${reason}`);
}

// TODO: 给出可能的推荐，比如同名不同 arity 或名称相似的标识符。
//       也许可以用 `npm:string-similarity`
export function runtimeError_unknownRegularFunction(
  name: string,
): RuntimeError {
  return makeRuntimeError(`名为 \`${name}\` 的通常函数并不存在`);
}

// TODO: 给出可能的推荐，比如同名不同 arity 或名称相似的标识符。
//       也许可以用 `npm:string-similarity`
export function runtimeError_unknownVariable(
  name: string,
): RuntimeError {
  return makeRuntimeError(`名为 \`${name}\` 的变量并不存在`);
}

export function runtimeError_valueIsNotCallable() {
  return makeRuntimeError(`尝试调用不可被调用的值`);
}

export function runtimeError_duplicateClosureParameterNames(
  name: string,
): RuntimeError {
  return makeRuntimeError(`匿名函数存在重复的参数名 ${name}`);
}

export function runtimeError_badFinalResult(
  typeName: ValueTypeName,
): RuntimeError {
  return makeRuntimeError(
    `「${getTypeDisplayName(typeName)}」不能作为最终结果`,
  );
}

export function getTypeDisplayName(name: ValueTypeName) {
  switch (name) {
    case "integer":
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
