import { RuntimeError } from "@dicexp/naive-evaluator-runtime/runtime-errors";
import {
  getValueTypeName,
  Transformed,
  Value_Callable,
  Value_List,
  Value_Sequence,
  Value_Sequence$Sum,
  ValueTypeName,
} from "@dicexp/naive-evaluator-runtime/values";
import { ValueBox } from "@dicexp/naive-evaluator-runtime/value-boxes";
import { unwrapValue } from "@dicexp/naive-evaluator-runtime/utils";
import {
  DeclarationListToDefinitionMap,
  RuntimeProxyForFunction,
} from "@dicexp/naive-evaluator-runtime/regular-functions";
import { Unreachable } from "@dicexp/errors";

import { product, sum } from "../utils";

import { builtinFunctionDeclarations } from "./declarations";

export const builtinFunctionDefinitions: DeclarationListToDefinitionMap<
  typeof builtinFunctionDeclarations
> = { // 尚未实现的函数列表见 declarations
  // 掷骰：
  "reroll/2": (rtm, seq, callable) => {
    let isSum = rtm.getValueTypeName(seq) === "sequence$sum";

    let remainRolls = 0, shouldTrackBaseRolls = true;
    let abandonedBefore: ValueBox[] | number[] = [];

    const newSeq = rtm.createValue.sequenceTransformer(
      seq,
      ([status, item]): Transformed<ValueBox | number> => {
        const shouldRerollResult = tryUnwrapBoolean(
          rtm,
          callable._call([
            isSum
              ? rtm.createValueBox.direct(item as number)
              : item as ValueBox,
          ]),
          { functionFullName: "reroll/2" },
        );
        if (shouldRerollResult[0] === "error") return shouldRerollResult;

        const shouldReroll = shouldRerollResult[1];

        if (shouldTrackBaseRolls) {
          remainRolls++;
        }
        if (shouldReroll) {
          remainRolls++;
        }
        remainRolls--;

        if (status === "last_nominal") {
          shouldTrackBaseRolls = false;
        }

        if (shouldReroll) {
          // @ts-ignore
          abandonedBefore.push(item);
          return "more";
        } else {
          const newStatus = (!remainRolls && !shouldTrackBaseRolls)
            ? "last_nominal"
            : "ok";
          const itemType = abandonedBefore.length ? "🔄" : "regular";
          const abandonedBefore_ = abandonedBefore;
          abandonedBefore = [];
          return ["ok", [newStatus, [[itemType, item], abandonedBefore_]]];
        }
      },
    );

    return ["ok", newSeq];
  },
  "explode/2": (rtm, seq, callable) => {
    let isSum = rtm.getValueTypeName(seq) === "sequence$sum";

    let remainRolls = 0, shouldTrackBaseRolls = true;
    let isLastExploded = false;

    const newSeq = rtm.createValue.sequenceTransformer(
      seq,
      ([status, item]): Transformed<ValueBox | number> => {
        const shouldExplodeResult = tryUnwrapBoolean(
          rtm,
          callable._call([
            isSum
              ? rtm.createValueBox.direct(item as number)
              : item as ValueBox,
          ]),
          { functionFullName: "reroll/2" },
        );
        if (shouldExplodeResult[0] === "error") return shouldExplodeResult;

        const shouldExplode = shouldExplodeResult[1];

        if (shouldTrackBaseRolls) {
          remainRolls++;
        }
        if (shouldExplode) {
          remainRolls++;
        }
        remainRolls--;

        if (status === "last_nominal") {
          shouldTrackBaseRolls = false;
        }

        const newStatus = (!remainRolls && !shouldTrackBaseRolls)
          ? "last_nominal"
          : "ok";
        const itemType = isLastExploded
          ? "✨"
          : (shouldExplode ? "⚡️" : "regular");
        isLastExploded = shouldExplode;
        return ["ok", [newStatus, [[itemType, item]]]];
      },
    );

    return ["ok", newSeq];
  },

  // 实用：
  "abs/1": (_rtm, n) => ["ok", Math.abs(n)],
  "count/1": (_rtm, list) => ["ok", list.length],
  "count/2": (rtm, list, callable) => {
    const result = filter(rtm, list, callable, "count/2");
    if (result[0] === "error") return result;
    return ["ok", result[1].length];
  },
  "has?/2": (_rtm, list, value) => {
    const scalarSpec = new Set(["integer", "boolean"] as const);
    for (const el of list) {
      const result = unwrapValue(scalarSpec, el);
      if (result[0] === "error") {
        return ["error", "传入的列表存在非「整数或布尔」项"];
      }
      if (result[0] === "error_indirect") return result;
      // result[0] === "ok"
      if (result[1] === value) return ["ok", true];
    }
    return ["ok", false];
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
  "min/1": (rtm, list) => {
    const result = rtm.utils.unwrapList("integer", list);
    if (result === "error") return ["error", "传入的列表存在非「数字」项"];
    if (result[0] === "error_indirect") return result;
    const values = result[1] as number[];
    if (values.length === 0) return ["error", "列表为空"];
    let minimum = values[0]!;
    for (let i = 1; i < values.length; i++) {
      if (values[i]! < minimum) minimum = values[i]!;
    }
    return ["ok", minimum];
  },
  "max/1": (rtm, list) => {
    const result = rtm.utils.unwrapList("integer", list);
    if (result === "error") return ["error", "传入的列表存在非「数字」项"];
    if (result[0] === "error_indirect") return result;
    const values = result[1] as number[];
    if (values.length === 0) return ["error", "列表为空"];
    let maximum = values[0]!;
    for (let i = 1; i < values.length; i++) {
      if (values[i]! > maximum) maximum = values[i]!;
    }
    return ["ok", maximum];
  },
  "all?/1": (rtm, list) => {
    const result = rtm.utils.flattenListAll("boolean", list);
    if (result === "error") return ["error", "传入的列表存在非「布尔」项"];
    if (result[0] === "error_indirect") return result;
    return ["ok", result[1].every((x) => x)];
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
  "sort/2": (rtm, list, callable) => {
    // 稳定排序（Elixir 式合并排序）：直接对元素盒子排序（元素保持未求值），
    // 每次比较调用 callable 并强制其结果（「真」代表前者不晚于后者，平局时
    // 取左侧以保持原有相对顺序）。callable 出错或返回非布尔值时记录第一个
    // 错误，其后的比较不再触发用户代码，最后把错误作为整个调用的结果返回。
    let error: RuntimeError | null = null;
    const comesFirst = (a: ValueBox, b: ValueBox): boolean => {
      if (error) return false;
      const result = tryUnwrapBoolean(
        rtm,
        rtm.callCallable(callable, [a, b]),
        { functionFullName: "sort/2" },
      );
      if (result[0] === "error") {
        error = result[1];
        return false;
      }
      return result[1];
    };
    const sorted = mergeSortStable([...list], comesFirst);
    if (error) return ["error", error];
    return ["ok", rtm.createValue.list(sorted)];
  },
  "reverse/1": (rtm, list) => {
    const reversed = list.slice().reverse();
    return ["ok", rtm.createValue.list(reversed)];
  },
  "concat/2": (rtm, list1, list2) => {
    return ["ok", rtm.createValue.list([...list1, ...list2])];
  },
  "prepend/2": (rtm, list, el) => {
    return ["ok", rtm.createValue.list([el, ...list])];
  },
  // ...
  "append/2": (rtm, list, el) => {
    return ["ok", rtm.createValue.list([...list, el])];
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
  "at/3": (_rtm, list, index, defaultBox) => {
    if (index >= 0 && index < list.length) {
      return ["lazy", list[index]!];
    }
    return ["lazy", defaultBox];
  },
  "duplicate/2": (rtm, value, count) => {
    // 固定（pin）其值：每个位置是各自独立的惰性值盒，但都强制求值同一个
    // （未求值的）值盒，因此值只求值一次（如投掷骰子只投一次），而非重复
    // 求值。不直接重复同一个值盒是为了避免错误信标在同一列表中被重复
    // 注册（其值出错时会使运行时崩溃）。
    if (count <= 0) return ["ok", rtm.createValue.list([])];
    const copies = Array.from({ length: count }, () =>
      rtm.createValueBox.lazy(() => value)
    );
    return ["ok", rtm.createValue.list(copies)];
  },
  "flatten/2": (rtm, list, depth) => {
    const result = flattenListDepth(list, depth);
    if (result[0] === "error_indirect") return result;
    return ["ok", rtm.createValue.list(result[1])];
  },
  "flattenAll/1": (rtm, list) => {
    const result = flattenListDepth(list, Infinity);
    if (result[0] === "error_indirect") return result;
    return ["ok", rtm.createValue.list(result[1])];
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
  "flatMap/2": (rtm, list, callable) => {
    // 类似映射后再作深度为 1 的扁平化：对每个元素调用 callable（元素未求值）
    // 并强制其结果；结果（经隐式转换后）须为列表，其元素盒子按原样追加。
    const result: ValueBox[] = [];
    for (const el of list) {
      const box = rtm.callCallable(callable, [el]);
      const getResult = box.get();
      if (getResult[0] === "error") return getResult;

      let value = getResult[1];
      let typeName: ValueTypeName = rtm.getValueTypeName(value);
      if (typeName === "sequence" || typeName === "sequence$sum") {
        value = (value as Value_Sequence | Value_Sequence$Sum).castImplicitly();
        typeName = rtm.getValueTypeName(value);
      }
      if (typeName !== "list") {
        const err = runtimeError_givenClosureReturnValueTypeMismatch(
          rtm,
          "flatMap/2",
          "list",
          typeName,
          2,
        );
        return ["error", err];
      }
      const subList = value as Value_List;
      for (let i = 0; i < subList.length; i++) {
        result.push(subList[i]!);
      }
    }
    return ["ok", rtm.createValue.list(result)];
  },
  // ...
  "filter/2": (rtm, list, callable) => {
    // FIXME: 应该展现对每个值的过滤步骤
    // FIXME: 应该惰性求值
    return filter(rtm, list, callable, "filter/2");
  },
  "foldl/3": (rtm, list, init, callable) => {
    // 每一步都强制累积值（严格累积器），避免深的惰性链；元素盒子不求值。
    let acc = init;
    for (const el of list) {
      const box = rtm.callCallable(callable, [acc, el]);
      const result = box.get();
      if (result[0] === "error") return ["error", result[1]];
      acc = box;
    }
    return ["lazy", acc];
  },
  "foldr/3": (rtm, list, init, callable) => {
    // 自右向左构建嵌套的惰性调用；foldr 不强制累积值（由闭包决定）。
    // 注意：朴素实现里闭包 `_call` 会在调用时强制函数体
    // （`createValueBoxOfIndirectErrorIfErrorIsFromArgument` 的 `.get()`），
    // 因此每一次调用都必须再包一层惰性盒子，否则函数体会按构建顺序
    // （自右向左）被提前求值 —— 掷骰顺序应与 nova 一致（自外向内）。
    let acc = init;
    for (let i = list.length - 1; i >= 0; i--) {
      const args = [list[i]!, acc] as const;
      acc = rtm.createValueBox.lazy(() => rtm.callCallable(callable, [...args]));
    }
    return ["lazy", acc];
  },
  "unfold/2": (rtm, seed, callable) => {
    // 每次拉取：先强制当前种子（严格逐拉取，避免深的惰性链），再调用
    // callable 并强制其结果；结果为 false 时序列（真正地）结束，为含两个
    // 元素的列表时产出首元素（不求值）并以第二个元素为下一个种子，其余
    // 情况为步骤错误（以终止错误元素产出，此后序列结束）。
    let acc = seed;
    let isDone = false;
    const sequence = rtm.createValue.sequence(() => {
      if (isDone) return null;

      const seedResult = acc.get();
      if (seedResult[0] === "error") {
        isDone = true;
        return terminalErrorItem(rtm, seedResult[1]);
      }

      const stepBox = rtm.callCallable(callable, [acc]);
      const stepResult = stepBox.get();
      if (stepResult[0] === "error") {
        isDone = true;
        return terminalErrorItem(rtm, stepResult[1]);
      }

      const step = stepResult[1];
      if (step === false) {
        isDone = true;
        return null;
      }

      const stepType = rtm.getValueTypeName(step);
      if (stepType !== "list") {
        isDone = true;
        const err = rtm.createRuntimeError.simple(
          `传入 unfold/2 的闭包的返回值类型与期待不符：` +
            `期待「布尔」或含两个元素的列表，` +
            `实际「${rtm.getTypeDisplayName(stepType)}」。`,
        );
        return terminalErrorItem(rtm, err);
      }

      const pair = step as Value_List;
      if (pair.length !== 2) {
        isDone = true;
        const err = rtm.createRuntimeError.simple(
          `传入 unfold/2 的闭包返回的列表应含两个元素，` +
            `实际含 ${pair.length} 个。`,
        );
        return terminalErrorItem(rtm, err);
      }

      acc = pair[1]!;
      return ["ok", [["regular", pair[0]!]]];
    });
    return ["ok", sequence];
  },
  "iterate/2": (rtm, start, callable) => {
    // 第 0 项为强制后的 start；第 i+1 项为强制后的 f(第 i 项)
    // （严格逐拉取，各项按位置记忆化）。
    let current = start;
    let isFirst = true;
    let isDone = false;
    const sequence = rtm.createValue.sequence(() => {
      if (isDone) return null;

      let itemBox: ValueBox;
      if (isFirst) {
        isFirst = false;
        itemBox = current;
      } else {
        itemBox = rtm.callCallable(callable, [current]);
      }

      const result = itemBox.get();
      if (result[0] === "error") {
        isDone = true;
        return terminalErrorItem(rtm, result[1]);
      }
      current = itemBox;
      return ["ok", [["regular", current]]];
    });
    return ["ok", sequence];
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
  "last/1": (_rtm, list) => {
    if (list.length === 0) return ["error", "列表为空"];
    return ["lazy", list[list.length - 1]!];
  },
  "init/1": (rtm, list) => {
    if (list.length === 0) return ["error", "列表为空"];
    return ["ok", rtm.createValue.list(list.slice(0, -1))];
  },
  "take/2": (rtm, list, n) => {
    if (n <= 0) return ["ok", rtm.createValue.list([])];
    if (Array.isArray(list)) {
      return ["ok", rtm.createValue.list(list.slice(0, n))];
    }
    // 序列：拉取第 0 至 n-1 个实际位置（流提前结束则提前停止），
    // 越过名义上的结束位置继续拉取（如 d）。
    const result: ValueBox[] = [];
    const isSum = list.type === "sequence$sum";
    for (let i = 0; i < n; i++) {
      const item = list.at(i);
      if (item === null) break;
      result.push(
        isSum ? rtm.createValueBox.direct(item as number) : item as ValueBox,
      );
    }
    return ["ok", rtm.createValue.list(result)];
  },
  "takeWhile/2": (rtm, list, callable) => {
    const result: ValueBox[] = [];
    for (const el of list) {
      const predicateResult = tryUnwrapBoolean(
        rtm,
        rtm.callCallable(callable, [el]),
        { functionFullName: "takeWhile/2" },
      );
      if (predicateResult[0] === "error") return predicateResult;
      if (!predicateResult[1]) break;
      result.push(el);
    }
    return ["ok", rtm.createValue.list(result)];
  },
  "drop/2": (rtm, list, n) => {
    if (n <= 0) {
      if (Array.isArray(list)) return ["ok", rtm.createValue.list([...list])];
      return ["ok", list];
    }
    if (Array.isArray(list)) {
      return ["ok", rtm.createValue.list(list.slice(n))];
    }
    // 序列：返回新的普通序列，惰性地跳过 n 次拉取（构造时什么都不拉取）；
    // 状态按源序列在位置 skip+i 处的状态原样传递；放弃 $sum 性。
    let nextIndex = 0;
    const isSum = list.type === "sequence$sum";
    const sequence = rtm.createValue.sequence(() => {
      while (nextIndex < n) {
        const skipped = list.at(nextIndex);
        nextIndex++;
        if (skipped === null) return null;
      }
      const current = list.atWithStatus(nextIndex);
      nextIndex++;
      if (!current) return null;
      const [status, item] = current;
      return [
        status,
        [
          [
            "regular",
            isSum ? rtm.createValueBox.direct(item as number) : item as ValueBox,
          ],
        ],
      ];
    });
    return ["ok", sequence];
  },
  "dropWhile/2": (rtm, list, callable) => {
    let i = 0;
    for (; i < list.length; i++) {
      const predicateResult = tryUnwrapBoolean(
        rtm,
        rtm.callCallable(callable, [list[i]!]),
        { functionFullName: "dropWhile/2" },
      );
      if (predicateResult[0] === "error") return predicateResult;
      if (!predicateResult[1]) break;
    }
    // 无论是因为遇到「假」而停止（保留自 i 起的剩余元素），还是因为
    // 列表耗尽（保留空列表），剩余元素都不再被 callable 触碰。
    return ["ok", rtm.createValue.list(list.slice(i))];
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
  expectedReturnValueType: "integer" | "boolean" | "list",
  actualReturnValueType: ValueTypeName,
  position: number,
) {
  const expectedTypeText = rtm.getTypeDisplayName(expectedReturnValueType);
  const actualTypeText = rtm.getTypeDisplayName(actualReturnValueType);
  return rtm.createRuntimeError.simple(
    `作为第 ${position} 个参数传入通常函数 ${name} 的返回值类型与期待不符：` +
      `期待「${expectedTypeText}」，实际「${actualTypeText}」。`,
  );
}

/**
 * 以终止错误元素的形式产出错误：先产出一次带 “last” 状态的错误元素，
 * 此后序列结束（与 reroll/explode 等的终止错误规则一致）。
 */
function terminalErrorItem(
  rtm: RuntimeProxyForFunction,
  error: RuntimeError,
): ["last", [["regular", ValueBox]]] {
  return ["last", [["regular", rtm.createValueBox.error(error)]]];
}

/**
 * 稳定合并排序（Elixir `Enum.sort/2` 的语义）：`comesFirst(a, b)` 为
 * 「真」代表 a 不晚于 b；平局（两个方向都为「真」）时取左侧，以保持
 * 原有相对顺序。`comesFirst` 出错与否由调用方负责（其后的调用不应再
 * 触发用户代码）。
 */
function mergeSortStable<T>(
  items: T[],
  comesFirst: (a: T, b: T) => boolean,
): T[] {
  if (items.length <= 1) return items;

  const mid = items.length >> 1;
  const left = mergeSortStable(items.slice(0, mid), comesFirst);
  const right = mergeSortStable(items.slice(mid), comesFirst);

  const result: T[] = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (comesFirst(left[i]!, right[j]!)) {
      result.push(left[i]!);
      i++;
    } else {
      result.push(right[j]!);
      j++;
    }
  }
  while (i < left.length) result.push(left[i++]!);
  while (j < right.length) result.push(right[j++]!);
  return result;
}

/**
 * 扁平化列表至给定深度（`Infinity` 即不限制深度）。
 *
 * 深度界限之上的元素会被强制（带隐式转换）以测试其是否为列表：是则
 * 递归（深度减一）；否则保留原始（已记忆化的）值盒。界限上的元素不被
 * 求值。使用显式的工作栈而非递归，以避免深层嵌套列表造成栈溢出。
 */
function flattenListDepth(
  list: ValueBox[],
  depth: number,
): ["ok", ValueBox[]] | ["error_indirect", RuntimeError] {
  const result: ValueBox[] = [];
  const stack: [box: ValueBox, depth: number][] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    stack.push([list[i]!, depth]);
  }

  while (stack.length > 0) {
    const [box, d] = stack.pop()!;
    if (!(d > 0)) {
      result.push(box);
      continue;
    }

    const unwrapResult = unwrapValue("*", box);
    if (unwrapResult[0] === "error_indirect") return unwrapResult;
    if (unwrapResult[0] === "error" || unwrapResult[0] === "lazy") {
      // 规格为 “*”：既不会有类型不匹配错误，也不会走惰性分支。
      throw new Unreachable();
    }
    // unwrapResult[0] === "ok"

    const value = unwrapResult[1];
    if (getValueTypeName(value) === "list") {
      const subList = value as Value_List;
      for (let i = subList.length - 1; i >= 0; i--) {
        stack.push([subList[i]!, d - 1]);
      }
    } else {
      result.push(box);
    }
  }

  return ["ok", result];
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
