import { representValue } from "../representations_impl";
import type { RegularFunction, RuntimeProxy } from "../runtime";
import {
  runtimeError_callArgumentTypeMismatch,
  runtimeError_typeMismatch,
  runtimeError_wrongArity,
  type TypeMismatchKind,
} from "../runtime_errors_impl";
import {
  asInteger,
  asList,
  type LazyValue,
  type RuntimeError,
  type RuntimeResult,
  type Value,
} from "../runtime_values/mod";
import {
  concretize,
  getTypeNameOfValue,
  type ValueTypeName,
} from "../values_impl";

export type ArgumentSpec =
  | "lazy"
  | ValueTypeName
  | "*"
  | Set<ValueTypeName>;

export type RegularFunctionArgument = LazyValue | Exclude<Value, RuntimeError>;

/**
 * NOTE: 由于目前没有错误恢复机制，出现错误必然无法挽回，
 *       因此返回的错误都视为不会改变。
 *       如果未来要引入错误恢复机制，不要忘记修改与上述内容相关的代码。
 */
export function makeFunction(
  spec: ArgumentSpec[],
  logic: (
    args: RegularFunctionArgument[],
    rtm: RuntimeProxy,
  ) => RuntimeResult<{ value: Value } | { lazy: LazyValue }>,
): RegularFunction {
  return (args_, rtm) => {
    const unwrapResult = unwrapArguments(spec, args_, rtm);
    if ("error" in unwrapResult) {
      return { error: unwrapResult.error };
    }

    return {
      ok: {
        _yield: () => {
          const result = logic(unwrapResult.ok.values, rtm);
          if ("error" in result) {
            return rtm.lazyValueFactory.error(result.error).memo;
          }

          if ("lazy" in result.ok) {
            return result.ok;
          }

          return {
            value: { ok: result.ok.value },
            representation: representValue(result.ok.value),
          };
        },
      },
    };
  };
}

function unwrapArguments(
  spec: ArgumentSpec[],
  args: LazyValue[],
  rtm: RuntimeProxy,
): RuntimeResult<{ values: RegularFunctionArgument[] }> {
  if (spec.length !== args.length) {
    return { error: runtimeError_wrongArity(spec.length, args.length) };
  }

  const values: RegularFunctionArgument[] = Array(args.length);

  for (const [i, arg] of args.entries()) {
    const result = unwrapValue(spec[i], arg, rtm, { nth: i + 1 });
    if ("error" in result) return result;
    const { value } = result.ok;
    values[i] = value;
  }

  return { ok: { values } };
}

export function unwrapValue(
  spec: ArgumentSpec,
  value: LazyValue,
  rtm: RuntimeProxy,
  opts?: CheckTypeOptions,
): RuntimeResult<{ value: RegularFunctionArgument }> {
  if (spec === "lazy") {
    // 是否多变就交由函数内部判断了
    return { ok: { value } };
  }

  const concrete = concretize(value, rtm);
  if ("error" in concrete.value) return concrete.value;

  const adapted = tryAdaptType(spec, concrete.value.ok, opts);
  if ("error" in adapted) {
    return { error: adapted.error };
  }

  return { ok: { value: adapted.ok } };
}

function tryAdaptType(
  spec: Exclude<ArgumentSpec, "lazy">,
  value: Value,
  opts: CheckTypeOptions = {},
): RuntimeResult<Value> {
  let typeName: ValueTypeName = getTypeNameOfValue(value);
  if (
    typeName === "integer$sum_extendable" && spec !== "integer$sum_extendable"
  ) {
    value = asInteger(value)!;
    typeName = "integer";
  } else if (typeName === "list$extendable" && spec !== "list$extendable") {
    value = asList(value)!;
    typeName = "list";
  }

  const error = checkType(spec, typeName, opts);
  if (error) return { error };

  return { ok: value };
}

interface CheckTypeOptions {
  nth?: number;
  kind?: TypeMismatchKind;
}

function checkType(
  expected: Exclude<ArgumentSpec, "lazy">,
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
 * @param list
 */
export function flattenListAll(
  spec: Exclude<ArgumentSpec, "lazy">,
  list: LazyValue[],
  rtm: RuntimeProxy,
): RuntimeResult<{ values: Value[] }> {
  if (spec !== "*") {
    if (spec instanceof Set) {
      spec.add("list");
    } else {
      spec = new Set([spec, "list"]);
    }
  }

  const values: Value[] = [];

  for (const [i, elem] of list.entries()) {
    const result = unwrapValue(spec, elem, rtm);
    if ("error" in result) return result;
    // FIXME: 类型推断
    const { value: _value } = result.ok;
    const value = _value as Value;

    if (getTypeNameOfValue(value) === "list") {
      const listResult = flattenListAll(spec, value as LazyValue[], rtm);
      if ("error" in listResult) return listResult;
      values.push(...listResult.ok.values);
    } else {
      values[i] = value;
    }
  }

  return { ok: { values } };
}

/**
 * FIXME: 前后类型不一致时返回的错误不够清晰，应该明确是前后不一致造成的
 * @param specOneOf
 * @param list
 * @returns
 */
export function unwrapListOneOf(
  specOneOf: Set<ValueTypeName>,
  list: LazyValue[],
  rtm: RuntimeProxy,
): RuntimeResult<{ values: Value[] }> {
  if (!list.length) return { ok: { values: [] } };

  const values: Value[] = Array(list.length);
  let firstType: ValueTypeName;

  for (const [i, elem] of list.entries()) {
    let valueResult: ReturnType<typeof unwrapValue>;
    if (i === 0) {
      valueResult = unwrapValue(specOneOf, elem, rtm);
    } else {
      valueResult = unwrapValue(firstType!, elem, rtm, {
        kind: "list-inconsistency",
      });
    }
    if ("error" in valueResult) return valueResult;
    // FIXME: 类型推断
    const { value: _value } = valueResult.ok;
    const value = _value as Value;
    if (i === 0) {
      firstType = getTypeNameOfValue(value);
    }
    values[i] = value;
  }

  return { ok: { values } };
}
