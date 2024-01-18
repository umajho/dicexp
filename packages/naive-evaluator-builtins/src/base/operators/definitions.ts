import { RuntimeError } from "@dicexp/runtime/runtime-errors";
import type { Value } from "@dicexp/runtime/values";
import {
  DeclarationListToDefinitionMap,
  RuntimeProxyForFunction,
} from "@dicexp/runtime/regular-functions";
import { Unreachable } from "@dicexp/errors";

import type { builtinOperatorDeclarations } from "./declarations";

export const builtinOperatorDefinitions: DeclarationListToDefinitionMap<
  typeof builtinOperatorDeclarations
> = {
  "or/2": (_rtm, a, b) => ["ok", a || b],
  "and/2": (_rtm, a, b) => ["ok", a && b],

  "==/2": (rtm, a, b) => {
    if (typeof a !== typeof b) {
      return ["error", runtimeError_LeftRightTypeMismatch(rtm, "==")];
    }
    return ["ok", a === b];
  },
  "!=/2": (rtm, a, b) => {
    if (typeof a !== typeof b) {
      return ["error", runtimeError_LeftRightTypeMismatch(rtm, "!=")];
    }
    return ["ok", a !== b];
  },

  "</2": (_rtm, a, b) => ["ok", a < b],
  ">/2": (_rtm, a, b) => ["ok", a > b],
  "<=/2": (_rtm, a, b) => ["ok", a <= b],
  ">=/2": (_rtm, a, b) => ["ok", a >= b],

  "~/2": (rtm, lower, upper) => {
    let yieldedCount = 0;
    const sumValue = rtm.createValue.stream$sum(
      () => {
        const value = rtm.random.integer(lower, upper);
        yieldedCount++;
        return [
          yieldedCount === 1 ? "last_nominal" : "ok",
          [["regular", value]],
        ];
      },
      { initialNominalLength: 1 },
    );

    return ["ok", sumValue];
  },
  "~/1": (rtm, upper) => {
    const errRange = ensureUpperBound(rtm, "~", null, 1, upper);
    if (errRange) return ["error", errRange];

    return builtinOperatorDefinitions["~/2"](rtm, 1, upper);
  },

  "+/2": (_rtm, a, b) => ["ok", a + b],
  "-/2": (_rtm, a, b) => ["ok", a - b],
  "+/1": (_rtm, a) => ["ok", +a],
  "-/1": (_rtm, a) => ["ok", -a],

  "*/2": (_rtm, a, b) => ["ok", a * b],
  "///2": (rtm, a, b) => {
    if (b === 0) {
      const opRendered = renderOperation("//", `${a}`, `${b}`);
      const reason = "除数不能为零";
      return ["error", runtimeError_illegalOperation(rtm, opRendered, reason)];
    }
    return ["ok", a / b | 0];
  },
  "%/2": (rtm, a, b) => {
    if (a < 0) {
      const leftText = a < 0 ? `(${a})` : `${a}`;
      const opRendered = renderOperation("%", leftText, `${b}`);
      const reason = "被除数不能为负数";
      return ["error", runtimeError_illegalOperation(rtm, opRendered, reason)];
    } else if (b <= 0) {
      const leftText = a < 0 ? `(${a})` : `${a}`;
      const opRendered = renderOperation("%", leftText, `${b}`);
      const reason = "除数必须为正数";
      return ["error", runtimeError_illegalOperation(rtm, opRendered, reason)];
    }
    return ["ok", (a | 0) % b];
  },
  "**/2": (rtm, a, n) => {
    if (n < 0) {
      const opRendered = renderOperation("**", `${a}`, `${n}`);
      const reason = "指数不能为负数";
      return ["error", runtimeError_illegalOperation(rtm, opRendered, reason)];
    }
    return ["ok", a ** n];
  },

  "d/2": (rtm, n, x) => {
    const errRange = ensureUpperBound(rtm, "d", 1, 1, x);
    if (errRange) return ["error", errRange];

    let sumValue: Value;
    if (n === 0) {
      sumValue = 0;
    } else {
      let yieldedCount = 0;
      sumValue = rtm.createValue.stream$sum(
        () => {
          const value = rtm.random.integer(1, x);
          yieldedCount++;
          return [
            yieldedCount === n ? "last_nominal" : "ok",
            [["regular", value]],
          ];
        },
        { initialNominalLength: n },
      );
    }

    return ["ok", sumValue];
  },
  "d/1": (rtm, x) => {
    const errRange = ensureUpperBound(rtm, "d", 1, 1, x);
    if (errRange) return ["error", errRange];

    return builtinOperatorDefinitions["~/2"](rtm, 1, x);
  },

  "not/1": (_rtm, a) => ["ok", !a],
};

function ensureUpperBound(
  rtm: RuntimeProxyForFunction,
  op: string,
  left: number | null,
  min: number,
  actual: number,
  actualText: string | null = null,
): null | RuntimeError {
  if (actual < min) {
    const leftText = left === null ? null : `${left}`;
    const opRendered = renderOperation(op, leftText, `${actual}`);
    const reason = `范围上界（${actualText ?? actual}）不能小于 ${min}`;
    return runtimeError_illegalOperation(rtm, opRendered, reason);
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

function runtimeError_LeftRightTypeMismatch(
  rtm: RuntimeProxyForFunction,
  op: string,
) {
  const reason = "两侧操作数的类型不相同";
  return runtimeError_illegalOperation(rtm, op, reason);
}

export function runtimeError_illegalOperation(
  rtm: RuntimeProxyForFunction,
  operation: string,
  reason: string,
): RuntimeError {
  return rtm.createRuntimeError.simple(`操作 “${operation}” 非法：${reason}`);
}
