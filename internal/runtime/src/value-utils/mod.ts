import { Unreachable } from "@dicexp/errors";
import {
  runtimeError_callArgumentTypeMismatch,
  runtimeError_typeMismatch,
  TypeMismatchKind,
} from "../errors/mod";
import {
  asInteger,
  asList,
  getTypeNameOfValue,
  RuntimeError,
  Value,
  ValueBox,
  ValueSpec,
  ValueTypeName,
} from "../values/mod";

export function unwrapValue(
  spec: ValueSpec,
  valueBox: ValueBox,
  opts?: CheckTypeOptions,
): ["ok", Value] | ["lazy", ValueBox] | ["error", RuntimeError] {
  if (spec === "lazy") return ["lazy", valueBox];
  return unwrapValueNoLazy(spec, valueBox, opts);
}

function unwrapValueNoLazy(
  spec: Exclude<ValueSpec, "lazy">,
  valueBox: ValueBox,
  opts?: CheckTypeOptions,
): ["ok", Value] | ["error", RuntimeError] {
  const valueResult = valueBox.get();
  if (valueResult[0] === "error") return ["error", valueResult[1]];

  // alueResult[0] === "ok"
  // FIXME?: 适配前的值的步骤丢失了
  return tryAdaptType(spec, valueResult[1], opts);
}

function tryAdaptType(
  spec: Exclude<ValueSpec, "lazy">,
  value: Value,
  opts: CheckTypeOptions = {},
): ["ok", Value] | ["error", RuntimeError] {
  let typeName: ValueTypeName = getTypeNameOfValue(value);
  let shouldConvert = false;
  if (typeName === "integer$sum_extendable") {
    if (
      spec !== "integer$sum_extendable" &&
      !(spec instanceof Set && spec.has("integer$sum_extendable"))
    ) {
      typeName = "integer";
      shouldConvert = true;
    }
  } else if (typeName === "list$extendable") {
    if (
      spec !== "list$extendable" &&
      !(spec instanceof Set && spec.has("list$extendable"))
    ) {
      typeName = "list";
      shouldConvert = true;
    }
  }

  const error = checkType(spec, typeName, opts);
  if (error) return ["error", error];

  if (shouldConvert) {
    if (typeName === "integer") {
      value = asInteger(value)!;
    } else if (typeName === "list") {
      value = asList(value)!;
    } else {
      throw new Unreachable();
    }
  }

  return ["ok", value];
}

interface CheckTypeOptions {
  nth?: number;
  kind?: TypeMismatchKind;
}

function checkType(
  expected: Exclude<ValueSpec, "lazy">,
  actual: ValueTypeName,
  opts: CheckTypeOptions = {},
): null | RuntimeError {
  if (expected === "*") return null;
  if (expected instanceof Set) {
    if (expected.has(actual)) return null;
  } else if (expected === actual) {
    return null;
  }
  if (opts.nth !== undefined) {
    const nth = opts.nth;
    return runtimeError_callArgumentTypeMismatch(nth, expected, actual);
  } else {
    return runtimeError_typeMismatch(expected, actual, opts.kind ?? null);
  }
}

/**
 * @param spec 除了列表之外其他的元素应该满足的规格
 *
 * TODO: 区分问题在于 “存在参数求值时出错” 还是 “存在求出的值类型与规格不匹配”。
 */
export function flattenListAll(
  spec: Exclude<ValueSpec, "lazy">,
  list: ValueBox[],
): ["ok", Value[]] | "error" {
  if (spec !== "*") {
    if (spec instanceof Set) {
      spec.add("list");
    } else {
      spec = new Set([spec, "list"]);
    }
  }

  const values: Value[] = [];

  for (const [i, elem] of list.entries()) {
    const unwrapResult = unwrapValueNoLazy(spec, elem);
    if (unwrapResult[0] === "error") return "error";

    // unwrapResult[0] === "ok"
    const unwrappedElem = unwrapResult[1];

    if (getTypeNameOfValue(unwrappedElem) === "list") {
      const subResult = flattenListAll(spec, unwrappedElem as ValueBox[]);
      if (subResult === "error") return "error";
      values.push(...subResult[1]);
    } else {
      values[i] = unwrappedElem;
    }
  }

  return ["ok", values];
}

/**
 * FIXME: 前后类型不一致时返回的错误不够清晰，应该明确是前后不一致造成的
 * @param specOneOf
 * @param list
 * @returns
 */
export function unwrapListOneOf(
  specOneOf: Set<ValueTypeName>,
  list: ValueBox[],
): ["ok", Value[]] | "error" {
  if (!list.length) return ["ok", []];

  const values: Value[] = Array(list.length);
  let firstType: ValueTypeName;

  for (const [i, elem] of list.entries()) {
    let valueResult: ReturnType<typeof unwrapValueNoLazy>;
    if (i === 0) {
      valueResult = unwrapValueNoLazy(specOneOf, elem);
    } else {
      valueResult = unwrapValueNoLazy(firstType!, elem, {
        kind: "list-inconsistency",
      });
    }

    if (valueResult[0] === "error") return "error";

    values[i] = valueResult[1];
    if (i === 0) {
      firstType = getTypeNameOfValue(values[0]);
    }
  }

  return ["ok", values];
}
