import { Unimplemented } from "../../errors.ts";
import { getTypeName } from "./evaluated_values.ts";
import { makeFunction } from "./helpers.ts";
import { Scope } from "./runtime.ts";
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
  "~/2": () => { // TODO: 支持全角，当然或许可以直接在解析的时候转换？
    throw new Unimplemented();
  },
  "~/1": () => {
    throw new Unimplemented();
  },
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
      const reason = "除数不能为零";
      return new RuntimeError_IllegalOperation("//", `${lV}`, `${rV}`, reason);
    }
    return lV / rV | 0;
  }),
  "%/2": makeFunction("%", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    if (lV < 0) {
      const reason = "被除数不能为负数";
      return new RuntimeError_IllegalOperation("%", `${lV}`, `${rV}`, reason);
    } else if (rV <= 0) {
      const reason = "除数必须为正数";
      return new RuntimeError_IllegalOperation("%", `${lV}`, `${rV}`, reason);
    }
    return lV % rV;
  }),
  "d/2": () => {
    throw new Unimplemented();
  },
  "d%/2": () => {
    throw new Unimplemented();
  },
  "d/1": () => {
    throw new Unimplemented();
  },
  "d%/1": () => {
    throw new Unimplemented();
  },
  "^/2": makeFunction("^", ["number", "number"], ([left, right]) => {
    const [lV, rV] = [left.value, right.value] as [number, number];
    return lV ** rV;
  }),
  "!/1": makeFunction("-", ["boolean"], ([right]) => {
    const [rV] = [right.value] as [boolean];
    return !rV;
  }),
};
