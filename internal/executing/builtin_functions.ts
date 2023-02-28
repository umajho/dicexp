import { Unimplemented, Unreachable } from "../../errors.ts";
import { value } from "../parsing/building_blocks.ts";
import {
  ConcreteValue,
  concreteValue,
  getTypeName,
  LazyValue,
  lazyValue,
  typeDisplayText,
} from "./evaluated_values.ts";
import {
  flattenListAll,
  makeFunction,
  makeUnaryRedirection,
  testFlattenListType,
} from "./helpers.ts";
import { RandomGenerator, Scope } from "./runtime.ts";
import {
  RuntimeError,
  RuntimeError_IllegalOperation,
  RuntimeError_TypeMismatch,
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
  "|>/2": () => {
    throw new Unimplemented();
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
      const opRendered = renderOperation("//", `${lV}`, `${rV}`);
      const reason = "被除数不能为负数";
      return new RuntimeError_IllegalOperation(opRendered, reason);
    } else if (rV <= 0) {
      const opRendered = renderOperation("//", `${lV}`, `${rV}`);
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
  // sort/1
  // sort/2
  // reverse/1
  // concat/2
  // append/2
  // at/2
  // duplicate/2
  // flatten

  // 函数式：
  // map/2
  // flatMap/2
  // filter/2
  // foldl/3
  // foldr/3
  // head/1
  // tail/1
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
  // zipWith/3
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
