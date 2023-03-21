import inspect from "browser-util-inspect";
import {
  flattenListAll,
  makeFunction,
  unwrapListOneOf,
  unwrapValue,
} from "./builtin_function_helpers";

import { Unreachable } from "./errors";
import { RandomGenerator, Scope } from "./runtime";
import {
  getTypeDisplayName,
  RuntimeError,
  RuntimeError_IllegalOperation,
} from "./runtime_errors";
import {
  EitherStepOrError,
  GeneratorCallback,
  Step,
  Step_Plain,
} from "./steps";
import {
  getTypeNameOfValue,
  Value_Callable,
  Value_Generating,
  ValueTypeName,
} from "./values";

export const builtinScope: Scope = {
  "or/2": makeFunction(["boolean", "boolean"], (args, _rtm) => {
    const [left, right] = args as [boolean, boolean];
    return [left || right, null];
  }),
  "and/2": makeFunction(["boolean", "boolean"], (args, _rtm) => {
    const [left, right] = args as [boolean, boolean];
    return [left && right, null];
  }),

  "==/2": makeFunction(
    [["boolean", "number"], ["boolean", "number"]],
    (args, _rtm) => {
      const [left, right] = args as [boolean, boolean] | [number, number];
      if (typeof left !== typeof right) {
        return [null, error_LeftRightTypeMismatch("==")];
      }
      return [left === right, null];
    },
  ),
  "!=/2": makeFunction(
    [["boolean", "number"], ["boolean", "number"]],
    (args, _rtm) => {
      const [left, right] = args as [boolean, boolean] | [number, number];
      if (typeof left !== typeof right) {
        return [null, error_LeftRightTypeMismatch("!=")];
      }
      return [left !== right, null];
    },
  ),

  "</2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return [left < right, null];
  }),
  ">/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return [left > right, null];
  }),
  "<=/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return [left <= right, null];
  }),
  ">=/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return [left >= right, null];
  }),

  "|>/2": (_args, _rtm) => {
    const [calling, errCalling] = _args[1].calling;
    if (errCalling instanceof RuntimeError) return [null, errCalling];
    if (errCalling) {
      return [
        null,
        new RuntimeError_IllegalOperation("|>", "右侧并非正在被调用"),
      ];
    }
    const newCalling = calling.withArgs([_args[0], ...calling.args]);
    // TODO?: Step_Pipe
    return [new Step_Plain(newCalling), null];
  },

  // #/2
  "#/2": (_args, _rtm) => {
    const [_count, errCount] = unwrapValue("number", _args[0]);
    if (errCount) return [null, errCount];
    const count = _count as number;

    // TODO: 如果右侧是 Step_Generate，则仍返回 Step_Generate
    const seq: Step[] = Array(count);
    const template: Step = _args[1];
    for (let i = 0; i < count; i++) {
      const [itemValue, errItemValue] = unwrapValue("*", template.clone());
      // TODO: 包装 error
      if (errItemValue) [null, errItemValue];
      seq[i] = new Step_Plain(itemValue!);
    }

    return [new Step_Plain(seq), null];
  },

  "~/2": makeFunction(["number", "number"], (args, rtm) => {
    const bounds = args.sort() as [number, number];

    const cb: GeneratorCallback = {
      kind: "simple_number",
      fn: () => generateRandomNumber(rtm.random, bounds),
    };
    const g = new Value_Generating("sum", 1, "integer", cb, bounds);
    // FIXME: replacingStep: new Step_CreateGenerator(…)
    //        包括 ~/1、d/2、d%/2、d/1、d%/1 也都需要。
    return [g, null];
  }),
  "~/1": makeFunction(["number"], (args, rtm) => {
    const [right] = args as [number];
    const errRange = ensureUpperBound("~", null, 1, right);
    if (errRange) return [null, errRange];
    const bounds: [number, number] = [1, right];

    const cb: GeneratorCallback = {
      kind: "simple_number",
      fn: () => generateRandomNumber(rtm.random, bounds),
    };
    const g = new Value_Generating("sum", 1, "integer", cb, bounds);
    return [g, null];
  }),

  "+/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return [left + right, null];
  }),
  "-/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return [left - right, null];
  }),
  "+/1": makeFunction(["number"], (args, _rtm) => {
    const [right] = args as [number];
    return [+right, null];
  }),
  "-/1": makeFunction(["number"], (args, _rtm) => {
    const [right] = args as [number];
    return [-right, null];
  }),

  "*/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    return [left * right, null];
  }),
  "///2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    if (right === 0) {
      const opRendered = renderOperation("//", `${left}`, `${right}`);
      const reason = "除数不能为零";
      return [null, new RuntimeError_IllegalOperation(opRendered, reason)];
    }
    return [left / right | 0, null];
  }),
  "%/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    if (left < 0) {
      const leftText = left < 0 ? `(${left})` : `${left}`;
      const opRendered = renderOperation("%", leftText, `${right}`);
      const reason = "被除数不能为负数";
      return [null, new RuntimeError_IllegalOperation(opRendered, reason)];
    } else if (right <= 0) {
      const leftText = left < 0 ? `(${left})` : `${left}`;
      const opRendered = renderOperation("%", leftText, `${right}`);
      const reason = "除数必须为正数";
      return [null, new RuntimeError_IllegalOperation(opRendered, reason)];
    }
    return [(left | 0) % right, null];
  }),

  "d/2": makeFunction(["number", "number"], (args, rtm) => {
    const [n, right] = args as [number, number];
    const errRange = ensureUpperBound("d", 1, 1, right);
    if (errRange) return [null, errRange];
    const bounds: [number, number] = [1, right];

    const cb: GeneratorCallback = {
      kind: "simple_number",
      fn: () => generateRandomNumber(rtm.random, bounds),
    };
    const g = new Value_Generating("sum", n, "integer", cb, bounds);
    return [g, null];
  }),
  "d/1": makeFunction(["number"], (args, rtm) => { // TODO: makeUnaryRedirection("d", 1)
    const [right] = args as [number];
    const errRange = ensureUpperBound("d", 1, 1, right);
    if (errRange) return [null, errRange];
    const bounds: [number, number] = [1, right];

    const cb: GeneratorCallback = {
      kind: "simple_number",
      fn: () => generateRandomNumber(rtm.random, bounds),
    };
    const g = new Value_Generating("sum", 1, "integer", cb, bounds);
    return [g, null];
  }),
  "d%/2": makeFunction(["number", "number"], (args, rtm) => {
    const [n, right] = args as [number, number];
    const actualText = `${right}-1=${right - 1}`;
    const errRange = ensureUpperBound("d%", 1, 0, right - 1, actualText);
    if (errRange) return [null, errRange];
    const bounds: [number, number] = [0, right - 1];

    const cb: GeneratorCallback = {
      kind: "simple_number",
      fn: () => generateRandomNumber(rtm.random, bounds),
    };
    const g = new Value_Generating("sum", n, "integer", cb, bounds);
    return [g, null];
  }),
  "d%/1": makeFunction(["number"], (args, rtm) => { // TODO: makeUnaryRedirection("d%", 1)
    const [right] = args as [number];
    const actualText = `${right}-1=${right - 1}`;
    const errRange = ensureUpperBound("d%", 1, 0, right - 1, actualText);
    if (errRange) return [null, errRange];
    const bounds: [number, number] = [0, right - 1];

    const cb: GeneratorCallback = {
      kind: "simple_number",
      fn: () => generateRandomNumber(rtm.random, bounds),
    };
    const g = new Value_Generating("sum", 1, "integer", cb, bounds);
    return [g, null];
  }),

  "^/2": makeFunction(["number", "number"], (args, _rtm) => {
    const [left, right] = args as [number, number];
    if (right < 0) {
      const opRendered = renderOperation("^", `${left}`, `${right}`);
      const reason = "指数不能为负数";
      return [null, new RuntimeError_IllegalOperation(opRendered, reason)];
    }
    return [left ** right, null];
  }),

  "not/1": makeFunction(["boolean"], (args, _rtm) => {
    const [right] = args as [boolean];
    return [!right, null];
  }),
  //

  // 投骰子：
  // reroll/2
  // explode/2

  // 实用：
  // abs/1
  // count/1
  "count/2": makeFunction(["list", "callable"], (args, _rtm) => { // FIXME: 步骤丢失
    const [list, callable] = args as [Step[], Value_Callable];
    const [result, err] = filter(list, callable);
    if (err) return [null, err];
    return [result.length, null];
  }),
  // has?/2
  "sum/1": makeFunction(["list"], ([list_], _rtm) => {
    const [flatten_, err] = flattenListAll("number", list_ as Step[]);
    if (err) return [null, err];
    return [(flatten_ as number[]).reduce((acc, cur) => acc + cur), null];
  }),
  "product/1": makeFunction(["list"], ([list_], _rtm) => {
    const [flatten_, err] = flattenListAll("number", list_ as Step[]);
    if (err) return [null, err];
    return [(flatten_ as number[]).reduce((acc, cur) => acc * cur), null];
  }),
  // min/1
  // max/1
  // all?/1
  "any?/1": makeFunction(["list"], ([list_], _rtm) => {
    const [unwrappedList, err] = unwrapListOneOf(["boolean"], list_ as Step[]);
    if (err) return [null, err];
    return [unwrappedList.some((x) => x), null];
  }),
  "sort/1": makeFunction(["list"], ([list_], _rtm) => {
    const allowedTypes = ["number", "boolean"] as ValueTypeName[];
    const [list__, err] = unwrapListOneOf(allowedTypes, list_ as Step[]);
    if (err) return [null, err];
    const list = list__ as number[] | boolean[];
    const sortedList = (list).sort((a, b) => +a - +b);
    return [sortedList.map((el) => new Step_Plain(el)), null];
  }),
  // sort/2
  // reverse/1
  // concat/2
  // prepend/2
  "append/2": makeFunction(["list", "*"], ([list_, el], _rtm) => { // FIXME: 失去 laziness
    return [[...(list_ as Step[]), new Step_Plain(el)], null];
  }),
  "at/2": makeFunction(["list", "number"], (args, _rtm) => { // FIXME: 失去 laziness
    const [list, i] = args as [Step[], number];
    if (i >= list.length || i < 0) {
      const err = new RuntimeError(
        `访问列表越界：列表大小为 ${list.length}，提供的索引为 ${i}`,
      );
      return [null, err];
    }
    const el = list[i];
    return el.result;
  }),
  // at/3
  // duplicate/2
  // flatten/2
  // flattenAll/1

  // 函数式：
  "map/2": makeFunction(["list", "callable"], (args, _rtm) => { // FIXME: 步骤丢失
    const [list, callable] = args as [Step[], Value_Callable];
    const result = list.map((el) => new Step_Plain(callable.makeCalling([el])));
    return [result, null];
  }),
  // flatMap/2
  "filter/2": makeFunction(["list", "callable"], (args, _rtm) => { // FIXME: 步骤丢失
    const [list, callable] = args as [Step[], Value_Callable];
    const [result, err] = filter(list, callable);
    if (err) return [null, err];
    return [result, null];
  }),
  // foldl/3
  // foldr/3
  "head/1": makeFunction(["list"], (args, _rtm) => { // FIXME: 失去 laziness
    const [list] = args as [Step[]];
    if (list.length === 0) return [null, new RuntimeError("列表为空")];
    return list[0].result;
  }),
  "tail/1": makeFunction(["list"], (args, _rtm) => { // FIXME: 失去 laziness
    const [list] = args as [Step[]];
    if (list.length === 0) return [null, new RuntimeError("列表为空")];
    return [list.slice(1), null];
  }),
  // last/1
  // init/1
  // take/2
  // takeWhile/2
  // drop/2
  // dropWhile/2
  "zip/2": makeFunction(["list", "list"], (args, _rtm) => {
    const [left, right] = args as [Step[], Step[]];
    const zippedLength = Math.min(left.length, right.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      result[i] = [left[i], right[i]];
    }
    return [result, null];
  }),
  "zipWith/3": makeFunction(["list", "list", "callable"], (args, _rtm) => {
    const [left, right, fn] = args as [Step[], Step[], Value_Callable];
    const zippedLength = Math.min(left.length, right.length);
    const result = Array(zippedLength);
    for (let i = 0; i < zippedLength; i++) {
      result[i] = new Step_Plain(fn.makeCalling([left[i], right[i]]));
    }
    return [result, null];
  }),

  // 调试：
  // TODO: rtm.inspect 之类的
  // FIXME: 失去了 laziness
  "inspect!/1": (args_, _rtm) => {
    const [target] = args_;
    const [value, error] = unwrapValue("*", target);
    if (
      "console" in globalThis && "log" in globalThis.console &&
      typeof globalThis.console.log === "function"
    ) {
      if (error) {
        globalThis.console.log(inspect({ error }));
      } else {
        globalThis.console.log(inspect({ value }));
      }
    }
    return [target, error] as EitherStepOrError;
  },

  "if!/3": (args_, _rtm) => { // FIXME 失去了 laziness
    const [cond, errCond] = unwrapValue("boolean", args_[0]);
    if (errCond) return [null, errCond];

    if (cond) {
      return [args_[1], null];
    } else {
      return [args_[2], null];
    }
  },
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
  list: Step[],
  callable: Value_Callable,
): [Step[], null] | [null, RuntimeError] {
  const result: Step[] = [];
  for (const el of list) {
    const step = new Step_Plain(callable.makeCalling([el]));
    const [value, err] = step.result;
    if (err) return [null, err];
    if (typeof value !== "boolean") {
      const err = error_givenClosureReturnValueTypeMismatch(
        "filter/2",
        "boolean",
        getTypeNameOfValue(value),
        2,
      );
      return [null, err];
    }
    if (!value) continue;
    result.push(el);
  }
  return [result, null];
}
