import type {
  DeclarationListToDefinitionMap,
} from "@dicexp/runtime/regular-functions";
import type {
  RuntimeError,
  RuntimeProxyForFunction,
  Value_Callable,
  Value_List,
  ValueBox,
  ValueTypeName,
} from "@dicexp/runtime/values";

import { product, sum } from "../utils";

import { builtinFunctionDeclarations } from "./declarations";

export const builtinFunctionDefinitions: DeclarationListToDefinitionMap<
  typeof builtinFunctionDeclarations
> = { // 尚未实现的函数列表见 declarations
  // 掷骰：
  "reroll/2": (rtm, stream, callable) => {
    let isSum = rtm.getValueTypeName(stream) === "stream$sum";

    let remainRerolls = 0, hasExceededNominalLenght = false;
    let acc = isSum ? 0 : ([] as ValueBox[]);
    for (let i = 0;; i++) {
      const curResult = stream.atWithStatus(i);
      if (!curResult) break;
      const [curStatus, curValue] = curResult;

      const shouldRerollResult = tryUnwrapBoolean(
        rtm,
        callable._call([
          isSum
            ? rtm.createValueBox.direct(curValue as number)
            : curValue as ValueBox,
        ]),
        { functionFullName: "reroll/2" },
      );
      if (shouldRerollResult[0] === "error") return shouldRerollResult;

      const shouldReroll = shouldRerollResult[1];
      if (shouldReroll) {
        remainRerolls++;
      } else {
        if (isSum) {
          (acc as number) += curValue as number;
        } else {
          (acc as ValueBox[]).push(curValue as ValueBox);
        }
      }

      if (hasExceededNominalLenght) {
        remainRerolls--;
        if (!remainRerolls) break;
      }

      if (curStatus === "last") {
        break;
      } else if (curStatus === "last_nominal") {
        if (!remainRerolls) break;
        hasExceededNominalLenght = true;
      }
    }

    return [
      "ok",
      isSum ? acc as number : rtm.createValue.list(acc as ValueBox[]),
    ];
  },

  // 实用：
  "count/2": (rtm, list, callable) => {
    const result = filter(rtm, list, callable, "count/2");
    if (result[0] === "error") return result;
    return ["ok", result[1].length];
  },
  // ...
  "sum/1": (rtm, list) => {
    const result = rtm.utils.unwrapList("integer", list);
    // FIXME: 应该由 `flattenListAll`、`unwrapListOneOf` 这类函数返回错误，再由其调用者
    //        加工返回错误，而不是像这样直接断定错误信息。（不只这一处。）
    if (result === "error") return ["error", "传入的列表存在非「数字」项"];
    if (result[0] === "error_indirect") return result;
    return ["ok", sum(result[1] as number[])];
  },
  "product/1": (rtm, list) => {
    const result = rtm.utils.unwrapList("integer", list);
    if (result === "error") return ["error", "传入的列表存在非「数字」项"];
    if (result[0] === "error_indirect") return result;
    return ["ok", product(result[1] as number[])];
  },
  // ...
  "any?/1": (rtm, list) => {
    const result = rtm.utils.flattenListAll("boolean", list);
    if (result === "error") return ["error", "传入的列表存在非「布尔」项"];
    if (result[0] === "error_indirect") return result;
    return ["ok", result[1].some((x) => x)];
  },
  "sort/1": (rtm, list) => {
    const listItemTypeSpec = new Set(["integer", "boolean"] as const);
    const result = rtm.utils.unwrapListOneOf(listItemTypeSpec, list);
    if (result === "error") return ["error", "传入的列表不支持排序"];
    if (result[0] === "error_indirect") return result;
    const listJs = result[1] as number[] | boolean[];
    const sortedList = listJs.sort((a, b) => +a - +b);
    const sortedBoxList = sortedList.map((el) => rtm.createValueBox.direct(el));
    return ["ok", rtm.createValue.list(sortedBoxList)];
  },
  // ...
  "append/2": (rtm, list, el) => {
    return ["ok", rtm.createValue.list([...(list), el])];
  },
  "at/2": (_rtm, list, index) => {
    if (index >= list.length || index < 0) {
      return [
        "error",
        `访问列表越界：列表大小为 ${list.length}，提供的索引为 ${index}`,
      ];
    }
    return ["lazy", list[index]!];
  },
  // ...

  // 函数式：
  "map/2": (rtm, list, callable) => {
    const resultList: ValueBox[] = Array(list.length);
    let i = 0;
    for (; i < list.length;) {
      resultList[i] = rtm.callCallable(callable, [list[i]!]);
      i++;
      if (resultList[i - 1]!.confirmsError()) break;
    }
    for (; i < list.length; i++) {
      resultList[i] = rtm.createValueBox.unevaluated();
    }
    return ["ok", rtm.createValue.list(resultList)];
  },
  // ...
  "filter/2": (rtm, list, callable) => {
    // FIXME: 应该展现对每个值的过滤步骤
    // FIXME: 应该惰性求值
    return filter(rtm, list, callable, "filter/2");
  },
  // ...
  "head/1": (_rtm, list) => {
    if (list.length === 0) return ["error", "列表为空"];
    return ["lazy", list[0]!];
  },
  "tail/1": (rtm, list) => {
    if (list.length === 0) return ["error", "列表为空"];
    return ["ok", rtm.createValue.list(list.slice(1))];
  },
  // ...
  "zip/2": (rtm, list1, list2) => {
    const zippedLength = Math.min(list1.length, list2.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      const listValue = rtm.createValue.list([list1[i]!, list2[i]!]);
      result[i] = rtm.createValueBox.container(listValue);
    }
    return ["ok", rtm.createValue.list(result)];
  },
  "zipWith/3": (rtm, list1, list2, callable) => {
    const zippedLength = Math.min(list1.length, list2.length);
    const result = Array(zippedLength);
    let i = 0;
    for (; i < zippedLength;) {
      const valueBox = rtm.callCallable(callable, [list1[i]!, list2[i]!]);
      result[i] = valueBox;
      i++;
      if (valueBox.confirmsError()) break;
    }
    for (; i < zippedLength; i++) {
      result[i] = rtm.createValueBox.unevaluated();
    }
    return ["ok", rtm.createValue.list(result)];
  },
  // 控制流
};

function filter(
  rtm: RuntimeProxyForFunction,
  list: ValueBox[],
  callable: Value_Callable,
  functionFullName: string,
): ["ok", Value_List] | ["error", RuntimeError] {
  const filtered: ValueBox[] = [];
  for (const el of list) {
    const result = tryUnwrapBoolean(rtm, rtm.callCallable(callable, [el]), {
      functionFullName,
    });
    if (result[0] === "error") return result;
    // result[0] === "ok"

    const value = result[1];

    if (!value) continue;
    filtered.push(el);
  }
  return ["ok", rtm.createValue.list(filtered)];
}

function runtimeError_givenClosureReturnValueTypeMismatch(
  rtm: RuntimeProxyForFunction,
  name: string,
  expectedReturnValueType: "integer" | "boolean",
  actualReturnValueType: ValueTypeName,
  position: number,
) {
  const expectedTypeText = rtm.getTypeDisplayName(expectedReturnValueType);
  const actualTypeText = rtm.getTypeDisplayName(actualReturnValueType);
  return rtm.makeRuntimeError(
    `作为第 ${position} 个参数传入通常函数 ${name} 的返回值类型与期待不符：` +
      `期待「${expectedTypeText}」，实际「${actualTypeText}」。`,
  );
}

function tryUnwrapBoolean(
  rtm: RuntimeProxyForFunction,
  box: ValueBox,
  opts: { functionFullName: string },
):
  | ["ok", boolean]
  | ["error", RuntimeError] {
  const result = box.get();
  if (result[0] === "error") return result;
  // result[0] === "ok"

  const value = result[1];
  if (typeof value !== "boolean") {
    const err = runtimeError_givenClosureReturnValueTypeMismatch(
      rtm,
      opts.functionFullName,
      "boolean",
      rtm.getValueTypeName(value),
      2,
    );
    return ["error", err];
  }

  return ["ok", value];
}
