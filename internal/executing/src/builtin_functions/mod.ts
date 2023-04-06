import {
  type ArgumentSpec,
  flattenListAll,
  makeFunction,
  unwrapListOneOf,
  unwrapValue,
} from "./helpers";

import type { RuntimeProxy, Scope } from "../runtime";
import { getTypeDisplayName } from "../runtime_errors_impl";
import {
  callCallable,
  concretize,
  getTypeNameOfValue,
  type ValueTypeName,
} from "../values_impl";
import {
  type LazyValue,
  makeRuntimeError,
  type RuntimeResult,
  type Value_Callable,
  type Value_List,
} from "../runtime_values/mod";
import { builtinOperatorDeclarations } from "./operators/declarations";
import { builtinOperatorDefinitions } from "./operators/definitions";
import type { RegularFunctionDeclaration } from "../regular_functions";

export const builtinScope: Scope = {
  ...(() => {
    const opScope: { [name: string]: Function } = {};

    for (const decl_ of builtinOperatorDeclarations) {
      const decl = decl_ as RegularFunctionDeclaration;
      const fullName = `${decl.name}/${decl.parameters.length}`;
      const argSpec = decl.parameters.map((param) =>
        param.type === "$lazy" ? "lazy" : param.type
      );
      const impl = (builtinOperatorDefinitions as any)[fullName];
      opScope[fullName] = makeFunction(
        argSpec as ArgumentSpec[],
        (args, rtm) => impl(rtm, ...args),
      );
    }

    return opScope;
  })(),

  // 投骰子：
  // reroll/2
  // explode/2

  // 实用：
  // abs/1
  // count/1
  "count/2": makeFunction(["list", "callable"], (args, rtm) => {
    const [list, callable] = args as [Value_List, Value_Callable];
    const result = filter(list, callable, rtm);
    if ("error" in result) return result;
    return { ok: { value: result.ok.length, pure: true } };
  }),
  // has?/2
  "sum/1": makeFunction(["list"], ([list_], rtm) => {
    const result = flattenListAll("integer", list_ as Value_List, rtm);
    if ("error" in result) return result;
    return {
      ok: {
        value: (result.ok.values as number[]).reduce((acc, cur) => acc + cur),
        pure: !result.ok.volatile,
      },
    };
  }),
  "product/1": makeFunction(["list"], ([list_], rtm) => {
    const result = flattenListAll("integer", list_ as Value_List, rtm);
    if ("error" in result) return result;
    return {
      ok: {
        value: (result.ok.values as number[]).reduce((acc, cur) => acc * cur),
        pure: !result.ok.volatile,
      },
    };
  }),
  // min/1
  // max/1
  // all?/1
  "any?/1": makeFunction(["list"], ([list_], rtm) => {
    const result = unwrapListOneOf(["boolean"], list_ as Value_List, rtm);
    if ("error" in result) return result;
    return {
      ok: {
        value: result.ok.values.some((x) => x),
        pure: result.ok.volatile,
      },
    };
  }),
  "sort/1": makeFunction(["list"], ([list_], rtm) => {
    const allowedTypes = ["integer", "boolean"] as ValueTypeName[];
    const result = unwrapListOneOf(allowedTypes, list_ as Value_List, rtm);
    if ("error" in result) return result;
    const list = result.ok.values as number[] | boolean[];
    const sortedList = list.sort((a, b) => +a - +b);
    return {
      ok: {
        value: sortedList.map((el) => rtm.lazyValueFactory.literal(el)),
        pure: !result.ok.volatile,
      },
    };
  }),
  // sort/2
  // reverse/1
  // concat/2
  // prepend/2
  "append/2": makeFunction(["list", "lazy"], ([list_, el], _rtm) => {
    return {
      ok: {
        value: [...(list_ as Value_List), el as LazyValue],
        // FIXME: 目前无法在不失去惰性的前提下确定返回值是否多变，
        //        而是暂时假定多变。
        //        以列表作为输入而不求值的函数都有这个问题，就不一一标记了
        pure: false,
      },
    };
  }),
  "at/2": makeFunction(["list", "integer"], (args, _rtm) => {
    const [list, i] = args as [Value_List, number];
    if (i >= list.length || i < 0) {
      const err = makeRuntimeError(
        `访问列表越界：列表大小为 ${list.length}，提供的索引为 ${i}`,
      );
      return { error: err };
    }
    return { ok: { lazy: list[i] } };
  }),
  // at/3
  // duplicate/2
  // flatten/2
  // flattenAll/1

  // 函数式：
  "map/2": makeFunction(["list", "callable"], (args, _rtm) => {
    // FIXME: 列表本身的产生也应该是惰性的
    //        （应该支持应用于无限长度的生成序列）
    //        同样的还有 `#`、`zip` 等函数
    const [list, callable] = args as [Value_List, Value_Callable];
    const resultList: Value_List = Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const callResult = callCallable(callable, [list[i]]);
      if ("error" in callResult) return callResult;
      resultList[i] = callResult.ok;
    }
    return { ok: { value: resultList, pure: false } };
  }),
  // flatMap/2
  "filter/2": makeFunction(["list", "callable"], (args, rtm) => {
    // FIXME: 应该展现对每个值的过滤步骤
    // FIXME: 应该惰性求值
    const [list, callable] = args as [Value_List, Value_Callable];
    const filterResult = filter(list, callable, rtm);
    if ("error" in filterResult) return filterResult;
    return { ok: { value: filterResult.ok, pure: false } };
  }),
  // foldl/3
  // foldr/3
  "head/1": makeFunction(["list"], (args, _rtm) => {
    const [list] = args as [Value_List];
    if (list.length === 0) return { error: makeRuntimeError("列表为空") };
    return { ok: { lazy: list[0] } };
  }),
  "tail/1": makeFunction(["list"], (args, _rtm) => { // FIXME: 失去 laziness
    const [list] = args as [Value_List];
    if (list.length === 0) return { error: makeRuntimeError("列表为空") };
    return { ok: { value: list.slice(1), pure: false } };
  }),
  // last/1
  // init/1
  // take/2
  // takeWhile/2
  // drop/2
  // dropWhile/2
  "zip/2": makeFunction(["list", "list"], (args, _rtm) => {
    const [left, right] = args as [Value_List, Value_List];
    const zippedLength = Math.min(left.length, right.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      result[i] = [left[i], right[i]];
    }
    return { ok: { value: result, pure: false } };
  }),
  "zipWith/3": makeFunction(["list", "list", "callable"], (args, _rtm) => {
    const [left, right, fn] = args as [
      Value_List,
      Value_List,
      Value_Callable,
    ];
    const zippedLength = Math.min(left.length, right.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      const callResult = callCallable(fn, [left[i], right[i]]);
      if ("error" in callResult) return callResult;
      result[i] = callResult.ok;
    }
    return { ok: { value: result, pure: false } };
  }),

  // 调试：
  // TODO: rtm.inspect 之类的
  // FIXME: 会将值固定住
  "inspect!/1": (args_, rtm) => {
    const [target] = args_;
    const result = unwrapValue("*", target, rtm);
    if (
      "console" in globalThis && "log" in globalThis.console &&
      typeof globalThis.console.log === "function"
    ) {
      if ("error" in result) {
        globalThis.console.log(JSON.stringify({ error: result.error }));
      } else {
        globalThis.console.log(JSON.stringify({ value: result.ok }));
      }
    }
    return { ok: target };
  },

  "if/3": makeFunction(["boolean", "lazy", "lazy"], (args, _rtm) => {
    const [p, whenT, whenF] = args as [boolean, LazyValue, LazyValue];
    return p ? { ok: { lazy: whenT } } : { ok: { lazy: whenF } };
  }),
};

function error_givenClosureReturnValueTypeMismatch(
  name: string,
  expectedReturnValueType: "integer" | "boolean",
  actualReturnValueType: ValueTypeName,
  position: number,
) {
  const expectedTypeText = getTypeDisplayName(expectedReturnValueType);
  const actualTypeText = getTypeDisplayName(actualReturnValueType);
  return makeRuntimeError(
    `作为第 ${position} 个参数传入通常函数 ${name} 的返回值类型与期待不符：` +
      `期待「${expectedTypeText}」，实际「${actualTypeText}」。`,
  );
}

function filter(
  list: Value_List,
  callable: Value_Callable,
  rtm: RuntimeProxy,
): RuntimeResult<Value_List> {
  const filtered: Value_List = [];
  for (const el of list) {
    const result = callCallable(callable, [el]);
    if ("error" in result) return result;
    const concrete = concretize(result.ok, rtm);
    if ("error" in concrete.value) return concrete.value;
    const value = concrete.value.ok;

    if (typeof value !== "boolean") {
      const err = error_givenClosureReturnValueTypeMismatch(
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
