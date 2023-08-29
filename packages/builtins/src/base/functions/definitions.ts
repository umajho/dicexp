import {
  DeclarationListToDefinitionMap,
} from "@dicexp/runtime/regular-functions";
import {
  flattenListAll,
  unwrapList,
  unwrapListOneOf,
} from "@dicexp/runtime/value-utils";
import {
  callCallable,
  getDisplayNameFromTypeName,
  getTypeNameOfValue,
  makeRuntimeError,
  RuntimeError,
  Value_Callable,
  Value_List,
  ValueBoxDircet,
  ValueBoxUnevaluated,
  ValueTypeName,
} from "@dicexp/runtime/values";
import { builtinFunctionDeclarations } from "./declarations";
import { product, sum } from "../utils";

export const builtinFunctionDefinitions: DeclarationListToDefinitionMap<
  typeof builtinFunctionDeclarations
> = { // 尚未实现的函数列表见 declarations
  // 投骰子：

  // 实用：
  "count/2": (_rtm, list, callable) => {
    const result = filter(list, callable);
    if (result[0] === "error") return result;
    return ["ok", result[1].length];
  },
  // ...
  "sum/1": (_rtm, list) => {
    const result = unwrapList("integer", list);
    // FIXME: 应该由 `flattenListAll`、`unwrapListOneOf` 这类函数返回错误，再由其调用者
    //        加工返回错误，而不是像这样直接断定错误信息。（不只这一处。）
    if (result === "error") return ["error", "传入的列表存在非「数字」项"];
    return ["ok", sum(result[1] as number[])];
  },
  "product/1": (_rtm, list) => {
    const result = unwrapList("integer", list);
    if (result === "error") return ["error", "传入的列表存在非「数字」项"];
    return ["ok", product(result[1] as number[])];
  },
  // ...
  "any?/1": (_rtm, list) => {
    const result = flattenListAll("boolean", list);
    if (result === "error") return ["error", "传入的列表存在非「布尔」项"];
    return ["ok", result[1].some((x) => x)];
  },
  "sort/1": (_rtm, list) => {
    const result = unwrapListOneOf(new Set(["integer", "boolean"]), list);
    if (result === "error") return ["error", "传入的列表不支持排序"];
    const listJs = result[1] as number[] | boolean[];
    const sortedList = listJs.sort((a, b) => +a - +b);
    return ["ok", sortedList.map((el) => new ValueBoxDircet(el))];
  },
  // ...
  "append/2": (_rtm, list, el) => {
    return ["ok", [...(list), el]];
  },
  "at/2": (_rtm, list, index) => {
    if (index >= list.length || index < 0) {
      return [
        "error",
        `访问列表越界：列表大小为 ${list.length}，提供的索引为 ${index}`,
      ];
    }
    return ["lazy", list[index]];
  },
  // ...

  // 函数式：
  "map/2": (_rtm, list, callable) => {
    const resultList: Value_List = Array(list.length);
    let i = 0;
    for (; i < list.length; i++) {
      resultList[i] = callCallable(callable, [list[i]]);
      if (resultList[i].confirmsError()) break;
    }
    for (; i < list.length; i++) {
      resultList[i] = new ValueBoxUnevaluated();
    }
    return ["ok", resultList];
  },
  // ...
  "filter/2": (_rtm, list, callable) => {
    // FIXME: 应该展现对每个值的过滤步骤
    // FIXME: 应该惰性求值
    return filter(list, callable);
  },
  // ...
  "head/1": (_rtm, list) => {
    if (list.length === 0) return ["error", "列表为空"];
    return ["lazy", list[0]];
  },
  "tail/1": (_rtm, list) => {
    if (list.length === 0) return ["error", "列表为空"];
    return ["ok", list.slice(1)];
  },
  // ...
  "zip/2": (_rtm, list1, list2) => {
    const zippedLength = Math.min(list1.length, list2.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      result[i] = new ValueBoxDircet([list1[i], list2[i]]);
    }
    return ["ok", result];
  },
  "zipWith/3": (_rtm, list1, list2, callable) => {
    const zippedLength = Math.min(list1.length, list2.length);
    const result = Array(zippedLength);
    let i = 0;
    for (; i < zippedLength; i++) {
      const valueBox = callCallable(callable, [list1[i], list2[i]]);
      result[i] = valueBox;
      if (valueBox.confirmsError()) break;
    }
    for (; i < zippedLength; i++) {
      result[i] = new ValueBoxUnevaluated();
    }
    return ["ok", result];
  },
  // 控制流
};

function filter(
  list: Value_List,
  callable: Value_Callable,
): ["ok", Value_List] | ["error", RuntimeError] {
  const filtered: Value_List = [];
  for (const el of list) {
    const result = callCallable(callable, [el]).get();
    if (result[0] === "error") return result;
    // result[0] === "ok"
    const value = result[1];

    if (typeof value !== "boolean") {
      const err = runtimeError_givenClosureReturnValueTypeMismatch(
        "filter/2",
        "boolean",
        getTypeNameOfValue(value),
        2,
      );
      return ["error", err];
    }
    if (!value) continue;
    filtered.push(el);
  }
  return ["ok", filtered];
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
