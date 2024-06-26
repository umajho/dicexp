import {
  createRuntimeError,
  RuntimeError,
  TypeMismatchKind,
} from "../runtime-errors/mod";
import { ValueBox } from "../value-boxes/mod";
import {
  getValueTypeName,
  Value,
  ValueSpec,
  ValueTypeName,
} from "../values/mod";

export function unwrapValue(
  spec: ValueSpec,
  valueBox: ValueBox,
  opts?: CheckTypeOptions,
):
  | ["ok", Value]
  | ["lazy", ValueBox]
  | ["error", RuntimeError]
  | ["error_indirect", RuntimeError] {
  if (spec === "lazy") return ["lazy", valueBox];
  return unwrapValueNoLazy(spec, valueBox, opts);
}

function unwrapValueNoLazy(
  spec: Exclude<ValueSpec, "lazy">,
  valueBox: ValueBox,
  opts?: CheckTypeOptions,
): ["ok", Value] | ["error", RuntimeError] | ["error_indirect", RuntimeError] {
  const valueResult = valueBox.get();
  if (valueResult[0] === "error") return ["error_indirect", valueResult[1]];

  // alueResult[0] === "ok"
  // FIXME?: 适配前的值的步骤丢失了
  return tryAdaptType(spec, valueResult[1], opts);
}

function tryAdaptType(
  spec: Exclude<ValueSpec, "lazy">,
  value: Value,
  opts: CheckTypeOptions = {},
): ["ok", Value] | ["error", RuntimeError] {
  let typeName: ValueTypeName = getValueTypeName(value);
  if (
    (typeName === "sequence$sum" && !isInSpec(spec, "sequence$sum")) ||
    (typeName === "sequence" && !isInSpec(spec, "sequence"))
  ) {
    value = (value as Extract<Value, { castImplicitly: any }>).castImplicitly();
    typeName = getValueTypeName(value);
  }

  const error = checkType(spec, typeName, opts);
  if (error) return ["error", error];

  return ["ok", value];
}

function isInSpec(spec: Exclude<ValueSpec, "lazy">, typeName: ValueTypeName) {
  return spec === typeName || (spec instanceof Set && spec.has(typeName));
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
    return createRuntimeError.callArgumentTypeMismatch(nth, expected, actual);
  } else {
    return createRuntimeError.typeMismatch(expected, actual, opts.kind ?? null);
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
): ["ok", Value[]] | "error" | ["error_indirect", RuntimeError] {
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
    if (unwrapResult[0] === "error_indirect") return unwrapResult;

    // unwrapResult[0] === "ok"
    const unwrappedElem = unwrapResult[1];

    if (getValueTypeName(unwrappedElem) === "list") {
      const subResult = flattenListAll(spec, unwrappedElem as ValueBox[]);
      if (subResult === "error" || subResult[0] === "error_indirect") {
        return subResult;
      }

      values.push(...subResult[1]);
    } else {
      values[i] = unwrappedElem;
    }
  }

  return ["ok", values];
}

/**
 * 将 ValueBox 的数组转为 Value 的数组，并保证元素的类型符合 spec。
 */
export function unwrapList(
  spec: ValueTypeName,
  list: ValueBox[],
): ["ok", Value[]] | "error" | ["error_indirect", RuntimeError] {
  if (!list.length) return ["ok", []];

  const values: Value[] = Array(list.length);
  for (const [i, elem] of list.entries()) {
    let valueResult = unwrapValueNoLazy(spec, elem);
    if (valueResult[0] === "error") return "error";
    if (valueResult[0] === "error_indirect") return valueResult;
    values[i] = valueResult[1];
  }

  return ["ok", values];
}

/**
 * 将 ValueBox 的数组转为 Value 的数组，并保证元素的类型是 specOneOf 之一，
 * 且各元素类型相同。
 *
 * FIXME: 前后类型不一致时返回的错误不够清晰，应该明确是前后不一致造成的
 */
export function unwrapListOneOf(
  specOneOf: Set<ValueTypeName>,
  list: ValueBox[],
): ["ok", Value[]] | "error" | ["error_indirect", RuntimeError] {
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
    if (valueResult[0] === "error_indirect") return valueResult;

    values[i] = valueResult[1];
    if (i === 0) {
      firstType = getValueTypeName(values[0]!);
    }
  }

  return ["ok", values];
}
