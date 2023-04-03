import { representValue } from "../representations";
import type { RegularFunction, RuntimeProxy } from "../runtime";
import {
  RuntimeError,
  RuntimeError_CallArgumentTypeMismatch,
  RuntimeError_TypeMismatch,
  RuntimeError_WrongArity,
} from "../runtime_errors";
import {
  concretize,
  getTypeNameOfValue,
  type LazyValue,
  type RuntimeResult,
  type Value,
  type ValueTypeName,
} from "../values";

type ArgumentSpec =
  | "lazy"
  | ValueTypeName
  | "*"
  | ValueTypeName[];

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
  ) => RuntimeResult<{ value: Value; pure: boolean } | { lazy: LazyValue }>,
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
            volatile: unwrapResult.ok.volatile || !result.ok.pure,
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
): RuntimeResult<{ values: RegularFunctionArgument[]; volatile: boolean }> {
  if (spec.length !== args.length) {
    return { error: new RuntimeError_WrongArity(spec.length, args.length) };
  }

  const values: RegularFunctionArgument[] = Array(args.length);
  let volatile = false;

  for (const [i, arg] of args.entries()) {
    const result = unwrapValue(spec[i], arg, rtm, { nth: i + 1 });
    if ("error" in result) return result;
    const { value, volatile: valueVolatile } = result.ok;
    values[i] = value;
    volatile = volatile || valueVolatile;
  }

  return { ok: { values, volatile } };
}

export function unwrapValue(
  spec: ArgumentSpec,
  value: LazyValue,
  rtm: RuntimeProxy,
  opts?: CheckTypeOptions,
): RuntimeResult<{ value: RegularFunctionArgument; volatile: boolean }> {
  if (spec === "lazy") {
    // 是否多变就交由函数内部判断了
    return { ok: { value, volatile: false } };
  }

  const concrete = concretize(value, rtm);
  if ("error" in concrete.value) return concrete.value;

  const errType = checkType(spec, getTypeNameOfValue(concrete.value.ok), opts);
  if (errType) return { error: errType };

  return { ok: { value: concrete.value.ok, volatile: concrete.volatile } };
}

interface CheckTypeOptions {
  nth?: number;
  kind?: RuntimeError_TypeMismatch["kind"];
}

function checkType(
  expected: Exclude<ArgumentSpec, "lazy">,
  actual: ValueTypeName,
  opts: CheckTypeOptions = {},
): null | RuntimeError_TypeMismatch | RuntimeError_CallArgumentTypeMismatch {
  if (expected === "*") return null;
  if (Array.isArray(expected)) {
    if (expected.findIndex((x) => testType(x, actual)) >= 0) return null;
  } else if (testType(expected, actual)) {
    return null;
  }
  if (opts.nth !== undefined) {
    const nth = opts.nth;
    return new RuntimeError_CallArgumentTypeMismatch(nth, expected, actual);
  } else {
    return new RuntimeError_TypeMismatch(expected, actual, opts.kind ?? null);
  }
}

function testType(expected: ValueTypeName, actual: ValueTypeName) {
  return expected === actual;
}

/**
 * @param spec 除了列表之外其他的元素应该满足的规格
 * @param list
 */
export function flattenListAll(
  spec: Exclude<ArgumentSpec, "lazy">,
  list: LazyValue[],
  rtm: RuntimeProxy,
): RuntimeResult<{ values: Value[]; volatile: boolean }> {
  if (spec !== "*") {
    if (Array.isArray(spec)) {
      if (spec[spec.length - 1] !== "list") {
        spec = [...spec, "list"];
      }
    } else {
      spec = [spec, spec];
    }
  }

  const values: Value[] = [];
  let volatile = false;

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
      volatile = volatile || listResult.ok.volatile;
    } else {
      values[i] = value;
      volatile = volatile || result.ok.volatile;
    }
  }

  return { ok: { values, volatile } };
}

/**
 * FIXME: 前后类型不一致时返回的错误不够清晰，应该明确是前后不一致造成的
 * @param specOneOf
 * @param list
 * @returns
 */
export function unwrapListOneOf(
  specOneOf: ValueTypeName[],
  list: LazyValue[],
  rtm: RuntimeProxy,
): RuntimeResult<{ values: Value[]; volatile: boolean }> {
  if (!list.length) return { ok: { values: [], volatile: false } };

  const values: Value[] = Array(list.length);
  let firstType: ValueTypeName;
  let volatile = false;

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
    volatile = volatile || valueResult.ok.volatile;
  }

  return { ok: { values, volatile } };
}
