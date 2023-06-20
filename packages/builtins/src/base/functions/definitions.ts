import {
  type DeclarationListToDefinitionMap,
  flattenListAll,
  unwrapListOneOf,
} from "@dicexp/runtime-regular-functions";
import {
  callCallable,
  concrete_literal,
  getDisplayNameFromTypeName,
  getTypeNameOfValue,
  makeRuntimeError,
  type RuntimeProxyForFunction,
  type RuntimeResult,
  type Value_Callable,
  type Value_List,
  type ValueTypeName,
} from "@dicexp/runtime-values";
import type { builtinFunctionDeclarations } from "./declarations";
import { sum } from "../utils";

export const builtinFunctionDefinitions: DeclarationListToDefinitionMap<
  typeof builtinFunctionDeclarations
> = { // 尚未实现的函数列表见 declarations
  // 投骰子：

  // 实用：
  "count/2": (rtm, list, callable) => {
    const result = filter(list, callable, rtm);
    if ("error" in result) return result;
    return { ok: { value: result.ok.length } };
  },
  // ...
  "sum/1": (rtm, list) => {
    const result = flattenListAll("integer", list, rtm);
    if ("error" in result) return result;
    return {
      ok: {
        value: sum(result.ok.values as number[]),
      },
    };
  },
  "product/1": (rtm, list) => {
    const result = flattenListAll("integer", list, rtm);
    if ("error" in result) return result;
    return {
      ok: {
        value: (result.ok.values as number[]).reduce((acc, cur) => acc * cur),
      },
    };
  },
  // ...
  "any?/1": (rtm, list) => {
    const result = unwrapListOneOf(new Set(["boolean"]), list, rtm);
    if ("error" in result) return result;
    return {
      ok: {
        value: result.ok.values.some((x) => x),
      },
    };
  },
  "sort/1": (rtm, list) => {
    const result = unwrapListOneOf(new Set(["integer", "boolean"]), list, rtm);
    if ("error" in result) return result;
    const listJs = result.ok.values as number[] | boolean[];
    const sortedList = listJs.sort((a, b) => +a - +b);
    return {
      ok: {
        value: sortedList.map((el) => ({ memo: concrete_literal(el) })),
      },
    };
  },
  // ...
  "append/2": (_rtm, list, el) => {
    // FIXME: 目前无法在不失去惰性的前提下确定返回值是否多变，
    //        而是暂时假定多变。
    //        以列表作为输入而不求值的函数都有这个问题，就不一一标记了
    return { ok: { value: [...(list), el] } };
  },
  "at/2": (_rtm, list, index) => {
    if (index >= list.length || index < 0) {
      const err = makeRuntimeError(
        `访问列表越界：列表大小为 ${list.length}，提供的索引为 ${index}`,
      );
      return { error: err };
    }
    return { ok: { lazy: list[index] } };
  },
  // ...

  // 函数式：
  "map/2": (_rtm, list, callable) => {
    const resultList: Value_List = Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const callResult = callCallable(callable, [list[i]]);
      if ("error" in callResult) return callResult;
      resultList[i] = callResult.ok;
    }
    return { ok: { value: resultList } };
  },
  // ...
  "filter/2": (rtm, list, callable) => {
    // FIXME: 应该展现对每个值的过滤步骤
    // FIXME: 应该惰性求值
    const filterResult = filter(list, callable, rtm);
    if ("error" in filterResult) return filterResult;
    return { ok: { value: filterResult.ok } };
  },
  // ...
  "head/1": (_rtm, list) => {
    if (list.length === 0) return { error: makeRuntimeError("列表为空") };
    return { ok: { lazy: list[0] } };
  },
  "tail/1": (_rtm, list) => {
    if (list.length === 0) return { error: makeRuntimeError("列表为空") };
    return { ok: { value: list.slice(1) } };
  },
  // ...
  "zip/2": (_rtm, list1, list2) => {
    const zippedLength = Math.min(list1.length, list2.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      result[i] = [list1[i], list2[i]];
    }
    return { ok: { value: result } };
  },
  "zipWith/3": (_rtm, list1, list2, callable) => {
    const zippedLength = Math.min(list1.length, list2.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      const callResult = callCallable(callable, [list1[i], list2[i]]);
      if ("error" in callResult) return callResult;
      result[i] = callResult.ok;
    }
    return { ok: { value: result } };
  },

  // 控制流
  "if/3": (_rtm, condition, whenTrue, whenFalse) => {
    return condition ? { ok: { lazy: whenTrue } } : { ok: { lazy: whenFalse } };
  },
};

function filter(
  list: Value_List,
  callable: Value_Callable,
  rtm: RuntimeProxyForFunction,
): RuntimeResult<Value_List> {
  const filtered: Value_List = [];
  for (const el of list) {
    const result = callCallable(callable, [el]);
    if ("error" in result) return result;
    const concrete = rtm.concretize(result.ok, rtm);
    if ("error" in concrete.value) return concrete.value;
    const value = concrete.value.ok;

    if (typeof value !== "boolean") {
      const err = runtimeError_givenClosureReturnValueTypeMismatch(
        "filter/2",
        "boolean",
        getTypeNameOfValue(value),
        2,
      );
      return { error: err };
    }
    if (!value) continue;
    filtered.push(el);
  }
  return { ok: filtered };
}

function runtimeError_givenClosureReturnValueTypeMismatch(
  name: string,
  expectedReturnValueType: "integer" | "boolean",
  actualReturnValueType: ValueTypeName,
  position: number,
) {
  const expectedTypeText = getDisplayNameFromTypeName(expectedReturnValueType);
  const actualTypeText = getDisplayNameFromTypeName(actualReturnValueType);
  return makeRuntimeError(
    `作为第 ${position} 个参数传入通常函数 ${name} 的返回值类型与期待不符：` +
      `期待「${expectedTypeText}」，实际「${actualTypeText}」。`,
  );
}
