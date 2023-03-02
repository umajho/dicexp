import { Unimplemented, Unreachable } from "../../errors.ts";
import { value } from "../parsing/building_blocks.ts";
import {
  asCallable,
  asLazyValue,
  Callable,
  ConcreteValue,
  concreteValue,
  errorValue,
  getTypeName,
  LazyValue,
  lazyValue,
  RuntimeValue,
  RuntimeValueTypes,
  typeDisplayText,
} from "./values.ts";
import {
  evalIfIsNotRuntimeValue,
  flattenListAll,
  invokeAll,
  invokeCallableImmediately,
  makeFunction,
  makeUnaryRedirection,
  renderCallableName,
  testFlattenListType,
} from "./helpers.ts";
import { RandomGenerator, Scope } from "./runtime.ts";
import {
  RuntimeError,
  RuntimeError_IllegalOperation,
  RuntimeError_TypeMismatch,
  RuntimeError_WrongArity,
} from "./runtime_errors.ts";

export const builtinScope: Scope = {
  "||/2": makeFunction("||", ["boolean", "boolean"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [boolean, boolean];
    return lV || rV;
  }),
  "&&/2": makeFunction("&&", ["boolean", "boolean"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [boolean, boolean];
    return lV && rV;
  }),
  "==/2": makeFunction( // TODO: `==` 与 `!=` 能否提取共同代码？
    "==",
    [["boolean", "number"], ["boolean", "number"]],
    ([left, right]) => {
      const [lV, rV] = [left.value, right.value] as [
        boolean | number,
        boolean | number,
      ];
      if (typeof lV !== typeof rV) {
        return new RuntimeError_TypeMismatch(
          getTypeName(left),
          getTypeName(right),
        );
      }
      return lV === rV;
    },
  ),
  "!=/2": makeFunction(
    "!=",
    [["boolean", "number"], ["boolean", "number"]],
    ([left, right]) => {
      const [lV, rV] = [left.value, right.value] as [
        boolean | number,
        boolean | number,
      ];
      if (typeof lV !== typeof rV) {
        return new RuntimeError_TypeMismatch(
          getTypeName(left),
          getTypeName(right),
        );
      }
      return lV !== rV;
    },
  ),
  "</2": makeFunction("<", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV < rV;
  }),
  ">/2": makeFunction(">", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV > rV;
  }),
  "<=/2": makeFunction("<=", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV <= rV;
  }),
  ">=/2": makeFunction(">=", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV >= rV;
  }),
  "|>/2": (params, _style, runtime) => {
    // FIXME: 将 style 改为 pipe
    if (params.length != 2) {
      return {
        result: errorValue(new RuntimeError_WrongArity("|>", 2, params.length)),
      };
    }

    const leftRtmValue = evalIfIsNotRuntimeValue(runtime.evaluate, params[0]);
    const leftValue = invokeAll(leftRtmValue);
    if (leftValue.kind === "error") return { result: leftValue }; // FIXME: step

    const rightValue = evalIfIsNotRuntimeValue(runtime.evaluate, params[1]);
    if (rightValue.kind === "error") return { result: rightValue }; // FIXME: step

    let result: RuntimeValue;
    const callable = asCallable(rightValue);
    if (callable) {
      result = callable.call([leftValue], "piped");
    } else {
      const origLazyValue = asLazyValue(rightValue);
      if (origLazyValue) {
        if (origLazyValue.frozen) {
          throw new Unimplemented();
        }
        result = lazyValue(origLazyValue.execute, [
          leftValue,
          ...origLazyValue.args,
        ], false);
      } else {
        throw new Unimplemented();
      }
    }
    return { result };
  },
  "#/2": () => {
    throw new Unimplemented();
  },
  "~/2": makeFunction("~", ["number", "number"], ([left, right], runtime) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return makeGeneratorWithRange(runtime.random, 1, [lV, rV]);
  }),
  "~/1": makeFunction("~", ["number"], ([right], runtime) => {
    const [rV] = [right.value] as [number];
    const err = ensureUpperBound("d", null, 1, rV);
    if (err != null) return err;
    return makeGeneratorWithRange(runtime.random, 1, [1, rV]);
  }),
  "+/2": makeFunction("+", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV + rV;
  }),
  "-/2": makeFunction("-", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV - rV;
  }),
  "+/1": makeFunction("+", ["number"], ([right]) => {
    const [rV] = [right.value] as [number];
    return rV;
  }),
  "-/1": makeFunction("-", ["number"], ([right]) => {
    const [rV] = [right.value] as [number];
    return -rV;
  }),
  "*/2": makeFunction("*", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV * rV;
  }),
  "///2": makeFunction("//", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    if (rV === 0) {
      const opRendered = renderOperation("//", `${lV}`, `${rV}`);
      const reason = "除数不能为零";
      return new RuntimeError_IllegalOperation(opRendered, reason);
    }
    return lV / rV | 0;
  }),
  "%/2": makeFunction("%", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    if (lV < 0) {
      const lVText = lV < 0 ? `(${lV})` : `${lV}`;
      const opRendered = renderOperation("%", lVText, `${rV}`);
      const reason = "被除数不能为负数";
      return new RuntimeError_IllegalOperation(opRendered, reason);
    } else if (rV <= 0) {
      const lVText = lV < 0 ? `(${lV})` : `${lV}`;
      const opRendered = renderOperation("%", lVText, `${rV}`);
      const reason = "除数必须为正数";
      return new RuntimeError_IllegalOperation(opRendered, reason);
    }
    return lV % rV;
  }),
  "d/2": makeFunction("d", ["number", "number"], ([left, right], runtime) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    const err = ensureUpperBound("d", 1, 1, rV);
    if (err != null) return err;
    return makeGeneratorWithRange(runtime.random, lV, [1, rV]);
  }),
  "d%/2": makeFunction("d%", ["number", "number"], ([left, right], runtime) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    const err = ensureUpperBound("d", 1, 0, rV - 1, `${rV}-1=${rV - 1}`);
    if (err != null) return err;
    return makeGeneratorWithRange(runtime.random, lV, [0, rV - 1]);
  }),
  "d/1": makeUnaryRedirection("d", value(1)),
  "d%/1": makeUnaryRedirection("d%", value(1)),
  "^/2": makeFunction("^", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV ** rV;
  }),
  "!/1": makeFunction("-", ["boolean"], ([right]) => {
    const [rV] = [right.value] as [boolean];
    return !rV;
  }),
  // 投骰子：
  // reroll/2
  // explode/2

  // 实用：
  "sum/1": makeFunction("sum", ["list"], ([list]) => {
    const _flatten = flattenListAll(list);
    if (!testFlattenListType(_flatten, "number")) {
      return error_flattenListElementTypesMismatch("sum/1", "number");
    } else {
      return (_flatten as number[]).reduce((acc, cur) => acc + cur);
    }
  }),
  "product/1": makeFunction("product", ["list"], ([list]) => {
    const _flatten = flattenListAll(list);
    if (!testFlattenListType(_flatten, "number")) {
      return error_flattenListElementTypesMismatch("product/1", "number");
    } else {
      return (_flatten as number[]).reduce((acc, cur) => acc * cur);
    }
  }),
  // min/1
  // max/1
  // all/1
  // any
  "sort/1": makeFunction("sort", ["list"], ([list]) => {
    const _flatten = flattenListAll(list);
    if (!testFlattenListType(_flatten, "number")) {
      return error_flattenListElementTypesMismatch("product/1", "number");
    } else {
      return (_flatten as number[]).sort().map((x) =>
        concreteValue(x, ["TODO: step"])
      );
    }
  }),
  // sort/2
  // reverse/1
  // concat/2
  // prepend/2
  "append/2": makeFunction("append", ["list", "*"], ([list_, el]) => {
    const list = list_.value as ConcreteValue[];
    return [...list, el];
  }),
  "at/2": makeFunction("at", ["list", "number"], ([list_, n_]) => {
    const list = list_.value as ConcreteValue[];
    const n = n_.value as number;
    if (n >= list.length && n < 0) {
      return new RuntimeError(
        `访问数组越界：数组大小为 ${list.length}，提供的索引为 ${n}`,
      );
    }
    return list[n].value;
  }),
  // duplicate/2
  // flatten

  // 函数式：
  "map/2": makeFunction("map", ["list", "callable"], ([list_, fn_]) => {
    const list = list_.value as ConcreteValue[];
    const fn = fn_.value as Callable;
    if (fn.forceArity !== undefined && fn.forceArity !== 1) {
      const fnName = renderCallableName(fn);
      return new RuntimeError_WrongArity(fnName, 1, fn.forceArity);
    }
    const resultList: ConcreteValue[] = Array(list.length);
    for (const [i, elem] of list.entries()) {
      const args = [elem];
      const result = invokeCallableImmediately(fn, args, "as-parameter");
      if (result.kind === "error") return result.error; // FIXME: step 丢失了
      resultList[i] = result;
    }
    return resultList;
  }),
  // flatMap/2
  "filter/2": makeFunction("filter", ["list", "callable"], ([list_, fn_]) => {
    const list = list_.value as ConcreteValue[];
    const fn = fn_.value as Callable;
    if (fn.forceArity !== undefined && fn.forceArity !== 1) {
      const fnName = renderCallableName(fn);
      return new RuntimeError_WrongArity(fnName, 1, fn.forceArity);
    }
    const resultList: ConcreteValue[] = [];
    for (const elem of list) {
      const args = [elem];
      const result = invokeCallableImmediately(fn, args, "as-parameter");
      if (result.kind === "error") return result.error; // FIXME: step 丢失了
      if (typeof result.value !== "boolean") {
        return error_inputFunctionReturnValueTypeMismatch(
          "filter",
          "boolean",
          getTypeName(result),
          2,
        );
      }
      if (result.value) {
        resultList.push(elem);
      }
    }
    return resultList;
  }),
  // foldl/3
  // foldr/3
  "head/1": makeFunction("head", ["list"], ([list_]) => {
    const list = list_.value as ConcreteValue[];
    if (list.length === 0) return new RuntimeError("数组为空");
    return list[0].value;
  }),
  "tail/1": makeFunction("tail", ["list"], ([list_]) => {
    const list = list_.value as ConcreteValue[];
    if (list.length === 0) return new RuntimeError("数组为空");
    return list.slice(1);
  }),
  // last/1
  // init/1
  // take/2
  // takeWhile/2
  // drop/2
  // dropWhile/2
  "zip/2": makeFunction("sum", ["list", "list"], ([l1_, l2_]) => {
    const listA = l1_.value as ConcreteValue[];
    const listB = l2_.value as ConcreteValue[];
    const zippedLength = Math.min(listA.length, listB.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      result[i] = [listA[i], listB[i]];
    }
    return result;
  }),
  "zipWith/3": makeFunction(
    "sum",
    ["list", "list", "callable"],
    ([l1_, l2_, fn_]) => {
      const listA = l1_.value as ConcreteValue[];
      const listB = l2_.value as ConcreteValue[];
      const fn = fn_.value as Callable;
      if (fn.forceArity !== undefined && fn.forceArity !== 2) {
        const fnName = renderCallableName(fn);
        return new RuntimeError_WrongArity(fnName, 2, fn.forceArity);
      }

      const zippedLength = Math.min(listA.length, listB.length);
      const resultList = Array(zippedLength);
      for (let i = 0; i < zippedLength; i++) {
        const args = [listA[i], listB[i]];
        const result = invokeCallableImmediately(fn, args, "as-parameter");
        if (result.kind === "error") return result.error; // FIXME: step 丢失了
        resultList[i] = result;
      }
      return resultList;
    },
  ),

  "inspect/1": makeFunction("inspect", ["*"], ([v]) => {
    // FIXME: step
    console.log(v);
    return v.value;
  }),
};

function makeGeneratorWithRange(
  rng: RandomGenerator,
  n: number,
  bounds: [number, number],
): LazyValue {
  if (bounds[0] > bounds[1]) {
    bounds = [bounds[1], bounds[0]];
  }
  const [lower, upper] = bounds;
  return lazyValue(
    (_args) => {
      let result = 0;
      for (let i = 0; i < n; i++) {
        const sides = upper - lower + 1;
        const maxUnbiased = (2 ** 32 / sides | 0) * sides - 1;
        let rn = rng.int32();
        while (rn > maxUnbiased) {
          rn = rng.int32();
        }
        const single = lower + (rn % sides);
        result += single;
      }
      return concreteValue(result, ["TODO: step"]);
    },
    [],
    true,
  );
}

function ensureUpperBound(
  op: string,
  left: number | null,
  min: number,
  actual: number,
  actualText: string | null = null,
) {
  if (actual < min) {
    const leftText = left === null ? null : `${left}`;
    const opRendered = renderOperation(op, leftText, `${actual}`);
    const reason = `范围上界（${actualText ?? actual}）不能小于 ${min}`;
    return new RuntimeError_IllegalOperation(opRendered, reason);
  }
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

function error_flattenListElementTypesMismatch(
  fnName: string,
  expectedElemType: "number" | "boolean",
  position = 1,
) {
  const expectedElemTypeDisplayText = typeDisplayText(expectedElemType);
  return new RuntimeError(
    `作为第 ${position} 个参数传入 \`${fnName}\` 的数组在扁平化后，` +
      `其成员必须皆为${expectedElemTypeDisplayText}`,
  );
}

function error_inputFunctionReturnValueTypeMismatch(
  fnName: string,
  expectedReturnValueType: "number" | "boolean",
  actualReturnValueType: RuntimeValueTypes,
  position: number,
) {
  const expectedTypeText = typeDisplayText(expectedReturnValueType);
  const actualTypeText = typeDisplayText(actualReturnValueType);
  return new RuntimeError(
    `作为第 ${position} 个参数传入 \`${fnName}\` 的函数的返回值类型与期待不符：` +
      `期待「${expectedTypeText}」，实际「${actualTypeText}」。`,
  );
}
