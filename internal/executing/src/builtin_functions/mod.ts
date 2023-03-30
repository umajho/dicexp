import {
  flattenListAll,
  makeFunction,
  unwrapListOneOf,
  unwrapValue,
} from "./helpers";

import { Unreachable } from "../errors";
import type { RandomGenerator, RuntimeProxy, Scope } from "../runtime";
import {
  getTypeDisplayName,
  RuntimeError,
  RuntimeError_IllegalOperation,
} from "../runtime_errors";
import {
  callCallable,
  concretize,
  getTypeNameOfValue,
  type LazyValue,
  type RuntimeResult,
  type Value_Callable,
  type Value_List,
  type ValueTypeName,
} from "../values";

export const builtinScope: Scope = {
  "or/2": makeFunction(["boolean", "boolean"], (args, _rtm) => {
    const [left, right] = args as [boolean, boolean];
    return { ok: { value: left || right, pure: true } };
  }),
  "and/2": makeFunction(["boolean", "boolean"], (args, _rtm) => {
    const [left, right] = args as [boolean, boolean];
    return { ok: { value: left && right, pure: true } };
  }),

  "==/2": makeFunction(
    [["boolean", "number"], ["boolean", "number"]],
    (args, _rtm) => {
      const [left, right] = args as [boolean, boolean] | [number, number];
      if (typeof left !== typeof right) {
        return { error: error_LeftRightTypeMismatch("==") };
      }
      return { ok: { value: left === right, pure: true } };
    },
  ),
  "!=/2": makeFunction(
    [["boolean", "number"], ["boolean", "number"]],
    (args, _rtm) => {
      const [left, right] = args as [boolean, boolean] | [number, number];
      if (typeof left !== typeof right) {
        return { error: error_LeftRightTypeMismatch("!=") };
      }
      return { ok: { value: left !== right, pure: true } };
    },
  ),

  "</2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return { ok: { value: left < right, pure: true } };
  }),
  ">/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return { ok: { value: left > right, pure: true } };
  }),
  "<=/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return { ok: { value: left <= right, pure: true } };
  }),
  ">=/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return { ok: { value: left >= right, pure: true } };
  }),

  // TODO: 真正实现
  "#/2": makeFunction(["number", "lazy"], (args, rtm) => {
    const [count, body] = args as [number, LazyValue];

    const list: Value_List = Array(count);
    for (let i = 0; i < count; i++) {
      list[i] = { _yield: () => concretize(body, rtm) };
    }

    return { ok: { value: list, pure: false } };
  }),

  // TODO: 真正实现
  "~/2": makeFunction(["number", "number"], (args, rtm) => {
    const bounds = args.sort() as [number, number];

    return {
      ok: { value: generateRandomNumber(rtm.random, bounds), pure: false },
    };
  }),
  // TODO: 真正实现
  "~/1": makeFunction(["number"], (args, rtm) => {
    const [right] = args as [number];
    const errRange = ensureUpperBound("~", null, 1, right);
    if (errRange) return { error: errRange };
    const bounds: [number, number] = [1, right];

    return {
      ok: { value: generateRandomNumber(rtm.random, bounds), pure: false },
    };
  }),

  "+/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return { ok: { value: left + right, pure: true } };
  }),
  "-/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return { ok: { value: left - right, pure: true } };
  }),
  "+/1": makeFunction(["number"], (args, _rtm) => {
    const [right] = args as [number];
    return { ok: { value: +right, pure: true } };
  }),
  "-/1": makeFunction(["number"], (args, _rtm) => {
    const [right] = args as [number];
    return { ok: { value: -right, pure: true } };
  }),

  "*/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return { ok: { value: left * right, pure: true } };
  }),
  "///2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    if (right === 0) {
      const opRendered = renderOperation("//", `${left}`, `${right}`);
      const reason = "除数不能为零";
      return { error: new RuntimeError_IllegalOperation(opRendered, reason) };
    }
    return { ok: { value: left / right | 0, pure: true } };
  }),
  "%/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    if (left < 0) {
      const leftText = left < 0 ? `(${left})` : `${left}`;
      const opRendered = renderOperation("%", leftText, `${right}`);
      const reason = "被除数不能为负数";
      return { error: new RuntimeError_IllegalOperation(opRendered, reason) };
    } else if (right <= 0) {
      const leftText = left < 0 ? `(${left})` : `${left}`;
      const opRendered = renderOperation("%", leftText, `${right}`);
      const reason = "除数必须为正数";
      return { error: new RuntimeError_IllegalOperation(opRendered, reason) };
    }
    return { ok: { value: (left | 0) % right, pure: true } };
  }),

  // TODO: 真正实现
  "d/2": makeFunction(["number", "number"], (args, rtm) => {
    const [n, right] = args as [number, number];
    const errRange = ensureUpperBound("d", 1, 1, right);
    if (errRange) return { error: errRange };
    const bounds: [number, number] = [1, right];

    let value = 0;
    for (let i = 0; i < n; i++) {
      value += generateRandomNumber(rtm.random, bounds);
    }
    return { ok: { value, pure: false } };
  }),
  // TODO: 真正实现
  "d/1": makeFunction(["number"], (args, rtm) => { // TODO: makeUnaryRedirection("d", 1)
    const [right] = args as [number];
    const errRange = ensureUpperBound("d", 1, 1, right);
    if (errRange) return { error: errRange };
    const bounds: [number, number] = [1, right];

    let value = 0;
    for (let i = 0; i < 1; i++) {
      value += generateRandomNumber(rtm.random, bounds);
    }
    return { ok: { value, pure: false } };
  }),
  // TODO: 真正实现
  "d%/2": makeFunction(["number", "number"], (args, rtm) => {
    const [n, right] = args as [number, number];
    const actualText = `${right}-1=${right - 1}`;
    const errRange = ensureUpperBound("d%", 1, 0, right - 1, actualText);
    if (errRange) return { error: errRange };
    const bounds: [number, number] = [0, right - 1];

    let value = 0;
    for (let i = 0; i < n; i++) {
      value += generateRandomNumber(rtm.random, bounds);
    }
    return { ok: { value, pure: false } };
  }),
  // TODO: 真正实现
  "d%/1": makeFunction(["number"], (args, rtm) => { // TODO: makeUnaryRedirection("d%", 1)
    const [right] = args as [number];
    const actualText = `${right}-1=${right - 1}`;
    const errRange = ensureUpperBound("d%", 1, 0, right - 1, actualText);
    if (errRange) return { error: errRange };
    const bounds: [number, number] = [0, right - 1];

    let value = 0;
    for (let i = 0; i < 1; i++) {
      value += generateRandomNumber(rtm.random, bounds);
    }
    return { ok: { value, pure: false } };
  }),

  "^/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    if (right < 0) {
      const opRendered = renderOperation("^", `${left}`, `${right}`);
      const reason = "指数不能为负数";
      return { error: new RuntimeError_IllegalOperation(opRendered, reason) };
    }
    return { ok: { value: left ** right, pure: true } };
  }),

  "not/1": makeFunction(["boolean"], (args, _rtm) => {
    const [right] = args as [boolean];
    return { ok: { value: !right, pure: true } };
  }),
  //

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
    const result = flattenListAll("number", list_ as Value_List, rtm);
    if ("error" in result) return result;
    return {
      ok: {
        value: (result.ok.values as number[]).reduce((acc, cur) => acc + cur),
        pure: !result.ok.volatile,
      },
    };
  }),
  "product/1": makeFunction(["list"], ([list_], rtm) => {
    const result = flattenListAll("number", list_ as Value_List, rtm);
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
    const allowedTypes = ["number", "boolean"] as ValueTypeName[];
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
  "at/2": makeFunction(["list", "number"], (args, _rtm) => {
    const [list, i] = args as [Value_List, number];
    if (i >= list.length || i < 0) {
      const err = new RuntimeError(
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
    if (list.length === 0) return { error: new RuntimeError("列表为空") };
    return { ok: { lazy: list[0] } };
  }),
  "tail/1": makeFunction(["list"], (args, _rtm) => { // FIXME: 失去 laziness
    const [list] = args as [Value_List];
    if (list.length === 0) return { error: new RuntimeError("列表为空") };
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

function ensureUpperBound(
  op: string,
  left: number | null,
  min: number,
  actual: number,
  actualText: string | null = null,
): null | RuntimeError_IllegalOperation {
  if (actual < min) {
    const leftText = left === null ? null : `${left}`;
    const opRendered = renderOperation(op, leftText, `${actual}`);
    const reason = `范围上界（${actualText ?? actual}）不能小于 ${min}`;
    return new RuntimeError_IllegalOperation(opRendered, reason);
  }
  return null;
}

function renderOperation(
  op: string,
  left: string | null,
  right: string | null,
) {
  if (left === null && right === null) throw new Unreachable();
  if (left === null) {
    return `${op} ${right}`;
  } else if (right === null) {
    return `${left} ${op}`;
  }
  return `${left} ${op} ${right}`;
}

function error_LeftRightTypeMismatch(op: string) {
  const reason = "两侧操作数的类型不相同";
  return new RuntimeError_IllegalOperation(op, reason);
}

function error_givenClosureReturnValueTypeMismatch(
  name: string,
  expectedReturnValueType: "number" | "boolean",
  actualReturnValueType: ValueTypeName,
  position: number,
) {
  const expectedTypeText = getTypeDisplayName(expectedReturnValueType);
  const actualTypeText = getTypeDisplayName(actualReturnValueType);
  return new RuntimeError(
    `作为第 ${position} 个参数传入通常函数 ${name} 的返回值类型与期待不符：` +
      `期待「${expectedTypeText}」，实际「${actualTypeText}」。`,
  );
}

export function generateRandomNumber(
  rng: RandomGenerator,
  bounds: [number, number],
): number {
  if (bounds[0] > bounds[1]) {
    bounds = [bounds[1], bounds[0]];
  }
  const [lower, upper] = bounds;

  const sides = upper - lower + 1;
  let maxUnbiased: number;
  if (sides <= 2) {
    maxUnbiased = 2 ** 32;
  } else {
    maxUnbiased = (2 ** 32 / sides | 0) * sides - 1;
  }
  let rn = rng.uint32();
  while (rn > maxUnbiased) {
    rn = rng.uint32();
  }
  const single = lower + (rn % sides);
  return single;
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
