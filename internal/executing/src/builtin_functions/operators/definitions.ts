import { Unreachable } from "@dicexp/errors";
import type { DeclarationListToDefinitionMap } from "../../regular_functions";
import { runtimeError_illegalOperation } from "../../runtime_errors_impl";
import type { RuntimeError, Value_List } from "../../runtime_values/mod";
import { concretize } from "../../values_impl";
import type { builtinOperatorDeclarations } from "./declarations";

export const builtinOperatorDefinitions: DeclarationListToDefinitionMap<
  typeof builtinOperatorDeclarations
> = {
  "or/2": (_rtm, a, b) => ({ ok: { value: a || b, pure: true } }),
  "and/2": (_rtm, a, b) => ({ ok: { value: a && b, pure: true } }),

  "==/2": (_rtm, a, b) => {
    if (typeof a !== typeof b) {
      return { error: runtimeError_LeftRightTypeMismatch("==") };
    }
    return { ok: { value: a === b, pure: true } };
  },
  "!=/2": (_rtm, a, b) => {
    if (typeof a !== typeof b) {
      return { error: runtimeError_LeftRightTypeMismatch("!=") };
    }
    return { ok: { value: a !== b, pure: true } };
  },

  "</2": (_rtm, a, b) => ({ ok: { value: a < b, pure: true } }),
  ">/2": (_rtm, a, b) => ({ ok: { value: a > b, pure: true } }),
  "<=/2": (_rtm, a, b) => ({ ok: { value: a <= b, pure: true } }),
  ">=/2": (_rtm, a, b) => ({ ok: { value: a >= b, pure: true } }),

  // TODO: 真正实现
  "#/2": (rtm, n, expr) => {
    const list: Value_List = Array(n);
    for (let i = 0; i < n; i++) {
      list[i] = { _yield: () => concretize(expr, rtm) };
    }

    return { ok: { value: list, pure: false } };
  },

  // TODO: 真正实现
  "~/2": (rtm, lower, upper) => ({
    ok: { value: rtm.random.integer(lower, upper), pure: false },
  }),
  "~/1": (rtm, upper) => {
    const errRange = ensureUpperBound("~", null, 1, upper);
    if (errRange) return { error: errRange };

    return builtinOperatorDefinitions["~/2"](rtm, 1, upper);
  },

  "+/2": (_rtm, a, b) => ({ ok: { value: a + b, pure: true } }),
  "-/2": (_rtm, a, b) => ({ ok: { value: a - b, pure: true } }),
  "+/1": (_rtm, a) => ({ ok: { value: +a, pure: true } }),
  "-/1": (_rtm, a) => ({ ok: { value: -a, pure: true } }),

  "*/2": (_rtm, a, b) => ({ ok: { value: a * b, pure: true } }),
  "///2": (_rtm, a, b) => {
    if (b === 0) {
      const opRendered = renderOperation("//", `${a}`, `${b}`);
      const reason = "除数不能为零";
      return { error: runtimeError_illegalOperation(opRendered, reason) };
    }
    return { ok: { value: a / b | 0, pure: true } };
  },
  "%/2": (_rtm, a, b) => {
    if (a < 0) {
      const leftText = a < 0 ? `(${a})` : `${a}`;
      const opRendered = renderOperation("%", leftText, `${b}`);
      const reason = "被除数不能为负数";
      return { error: runtimeError_illegalOperation(opRendered, reason) };
    } else if (b <= 0) {
      const leftText = a < 0 ? `(${a})` : `${a}`;
      const opRendered = renderOperation("%", leftText, `${b}`);
      const reason = "除数必须为正数";
      return { error: runtimeError_illegalOperation(opRendered, reason) };
    }
    return { ok: { value: (a | 0) % b, pure: true } };
  },
  "^/2": (_rtm, a, n) => {
    if (n < 0) {
      const opRendered = renderOperation("^", `${a}`, `${n}`);
      const reason = "指数不能为负数";
      return { error: runtimeError_illegalOperation(opRendered, reason) };
    }
    return { ok: { value: a ** n, pure: true } };
  },

  "d/2": (rtm, n, x) => {
    const errRange = ensureUpperBound("d", 1, 1, x);
    if (errRange) return { error: errRange };

    let value = 0;
    for (let i = 0; i < n; i++) {
      value += rtm.random.integer(1, x);
    }
    return { ok: { value, pure: false } };
  },
  "d/1": (rtm, x) => builtinOperatorDefinitions["d/2"](rtm, 1, x),

  "not/1": (_rtm, a) => ({ ok: { value: !a, pure: true } }),
};

function ensureUpperBound(
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
    return runtimeError_illegalOperation(opRendered, reason);
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

function runtimeError_LeftRightTypeMismatch(op: string) {
  const reason = "两侧操作数的类型不相同";
  return runtimeError_illegalOperation(op, reason);
}
