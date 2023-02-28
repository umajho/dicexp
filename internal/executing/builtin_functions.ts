import { Unimplemented, Unreachable } from "../../errors.ts";
import { value } from "../parsing/building_blocks.ts";
import {
  concreteValue,
  getTypeName,
  LazyValue,
  lazyValue,
} from "./evaluated_values.ts";
import { makeFunction, makeUnaryRedirection } from "./helpers.ts";
import { RandomGenerator, Scope } from "./runtime.ts";
import {
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
