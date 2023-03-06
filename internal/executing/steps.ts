import { Unimplemented, Unreachable } from "../../errors.ts";
import { RegularCallStyle } from "../parsing/building_blocks.ts";
import { FunctionRuntime, Scope } from "./runtime.ts";
import {
  RuntimeError,
  RuntimeError_BadFinalResult,
  RuntimeError_NotCallable,
} from "./runtime_errors.ts";
import {
  Evaluator,
  getTypeNameOfValue,
  makeRegularCallEvaluator,
  renderValue,
  Value,
  Value_Callable,
  Value_Calling,
  Value_Captured,
  Value_Closure,
  ValueTypeName,
} from "./values.ts";

export type EitherValueOrError = [Value, null] | [null, RuntimeError];
export type EitherValueOrErrorOrMismatch<T extends Value> =
  | [T, null]
  | [null, RuntimeError | { actualType: ValueTypeName }];

export type EitherValuesOrError = [Value[], null] | [null, RuntimeError];

// FIXME: 应该使用精瘦后的 Step，否则只有在完全执行完这些对象才会被垃圾回收
type TextStepPair = [string, Step | null];

export const ws = "{s}";

export abstract class Step {
  /**
   * - Value: 已经 evaluate 到了值
   * - undefined: 尚未 evaluate
   * - null: evaluate 返回了错误
   */
  #result: undefined | EitherValueOrError;

  get result(): EitherValueOrError {
    return this.#evaluateAndMemorize(true);
  }
  renderResultText(): string | null {
    if (this.#result === undefined) return "_";
    const [value, _] = this.#result;
    if (value === null) return null;
    return renderValue(value);
  }

  /**
   * 初始过程
   */
  abstract getInitialSteps?(): TextStepPair[];

  /**
   * 中间步骤
   */
  abstract getIntermediateSteps?(): TextStepPair[];

  /**
   * 初始步骤 ⇒ 中间步骤 ⇒ 结果文本
   * - 只有结果文本，如字面量（“1”）
   * - 有初始步骤和结果文本，如标识符（“foo⇒42”）、调用内建函数（“sum(l)⇒100”）、生成列表（“3#d4⇒[2,3,4]”）
   * - 有初始步骤、中间步骤和结果文本，如调用匿名函数（“\(x->x*2).(10)⇒10*2⇒20”，如果子步骤只有结果文本则不显示中间步骤）
   * - 也可以不显示结果文本，如列表字面量（“[100,foo⇒200,300]”）
   * - 层数过多：“…【生成器：3d4⇒1+2+3⇒6、d5⇒3】⇒42”
   * - 列表过大（如果剩余元素不都是生成器）：“[1,2,3,4,…共10项【生成器：d10⇒5】]”
   * - 生成器总量过多：“生成器：d8⇒4、…”“生成器略”
   * - 列表超生成器总量：“[d4⇒3,…共10项【生成器略】]”
   *
   * TODO: 把上面的放进 test 里
   */
  renderText() {
    throw new Unimplemented();
  }

  protected abstract evaluate?(): EitherValueOrError;
  #evaluateAndMemorize(evaluatesCalling: boolean): EitherValueOrError {
    if (!this.evaluate) throw new Unimplemented();
    if (this.#result === undefined) {
      this.#result = this.evaluate();
    }
    if (evaluatesCalling) {
      while (true) {
        const [value, error] = this.#result;
        if (error) break;
        if (getTypeNameOfValue(value) !== "calling") break;
        const calling = value as Value_Calling;
        this.#result = calling.call();
      }
    }
    return this.#result;
  }

  get number(): EitherValueOrErrorOrMismatch<number> {
    const [value, _] = this.result;
    if (value === null) return this.result;
    const valueType = getTypeNameOfValue(value);
    if (valueType !== "number") {
      return [null, { actualType: getTypeNameOfValue(value) }];
    }
    return [value as number, null];
  }

  get boolean(): EitherValueOrErrorOrMismatch<boolean> {
    const [value, _] = this.result;
    if (value === null) return this.result;
    const valueType = getTypeNameOfValue(value);
    if (valueType !== "boolean") {
      return [null, { actualType: getTypeNameOfValue(value) }];
    }
    return [value as boolean, null];
  }

  get list(): EitherValueOrErrorOrMismatch<Step[]> {
    const [value, _] = this.result;
    if (value === null) return this.result;
    const valueType = getTypeNameOfValue(value);
    if (valueType !== "list") {
      return [null, { actualType: getTypeNameOfValue(value) }];
    }
    return [value as Step[], null];
  }

  get closure(): EitherValueOrErrorOrMismatch<Value_Closure> {
    const [value, _] = this.result;
    if (value === null) return this.result;
    const valueType = getTypeNameOfValue(value);
    if (valueType !== "closure") {
      return [null, { actualType: getTypeNameOfValue(value) }];
    }
    return [value as Value_Closure, null];
  }

  get calling(): EitherValueOrErrorOrMismatch<Value_Calling> {
    const result = this.#evaluateAndMemorize(false);
    const [value, _] = result;
    if (value === null) return result;
    const valueType = getTypeNameOfValue(value);
    if (valueType !== "calling") {
      return [null, { actualType: getTypeNameOfValue(value) }];
    }
    return [value as Value_Calling, null];
  }
}

/**
 * 用于包装通常函数的返回值
 */
export class Step_Plain extends Step {
  #value: Value;

  constructor(value: Value) {
    super();
    this.#value = value;
  }

  getInitialSteps = undefined;
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return [this.#value, null];
  }
}

// TODO: Step_Erased，屏蔽掉过往的步骤，但保留惰性

type LiteralValue = number | boolean | Value_Closure | Value_Captured;
export class Step_Literal extends Step {
  #value: LiteralValue;

  constructor(value: LiteralValue) {
    super();
    this.#value = value;
  }

  getInitialSteps = undefined;
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return [this.#value, null];
  }
}

export class Step_Identifier extends Step {
  identifier: string;
  #stepOrError: Step | RuntimeError;

  constructor(identifier: string, stepOrError: Step | RuntimeError) {
    super();
    this.identifier = identifier;
    this.#stepOrError = stepOrError;
  }

  getInitialSteps(): TextStepPair[] {
    return [[this.identifier, null]];
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    if (this.#stepOrError instanceof RuntimeError) {
      return [null, this.#stepOrError];
    }
    return this.#stepOrError.result;
  }
}

export class Step_LiteralList extends Step {
  #value: Step[];

  constructor(value: Step[]) {
    super();
    this.#value = value;
  }

  getInitialSteps(): TextStepPair[] {
    if (!this.#value.length) return [["[]", null]];
    const body = this.#value
      .map((elem) => [`,${ws}`, elem]) as TextStepPair[];
    body[0][0] = "[";
    body.push(["]", null]);
    return body;
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return [this.#value, null];
  }
}

export class Step_RegularCall extends Step {
  #name: string;
  #args: Step[];
  #style: RegularCallStyle;

  #f: Evaluator;

  constructor(
    scope: Scope,
    name: string,
    args: Step[],
    style: RegularCallStyle,
    runtime: FunctionRuntime,
  ) {
    super();
    this.#name = name; // FIXME: 这时就可以确认函数是否存在了，应该 eager
    this.#args = args;
    this.#style = style;

    this.#f = makeRegularCallEvaluator(scope, this.#name, undefined, runtime);
  }

  getInitialSteps(): TextStepPair[] {
    return getCallingInitialSteps(this.#name, this.#args, this.#style);
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return [new Value_Calling(this.#f, undefined, this.#args), null];
  }
}

export class Step_ValueCall extends Step {
  #callee: Step;
  #calleeName: string | undefined = undefined;
  #args: Step[];

  constructor(
    callee: Step,
    args: Step[],
  ) {
    super();
    this.#callee = callee;
    this.#args = args;
  }

  getInitialSteps(): TextStepPair[] {
    const calleeName = this.#calleeName ?? "_";
    return getCallingInitialSteps(calleeName, this.#args, "value");
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    const [value, err] = this.#callee.result;
    if (err) return [value, err];

    if (!(value instanceof Value_Callable)) {
      return [null, new RuntimeError_NotCallable(renderValue(value))];
    }
    this.#calleeName = value.name;

    return [value.makeCalling(this.#args), null];
  }
}

// TODO: 检查右侧 Node 是否直接是 call
// export class Step_Pipe extends Step {
// }

// export class Step_Repeat extends Step {
// }

/**
 * 确保如果 result 没有错误，其中的 step 都已执行（不会返回错误）。
 */
export class Step_Final extends Step {
  #input: Step;

  constructor(input: Step) {
    super();
    this.#input = input;
  }

  getInitialSteps(): TextStepPair[] {
    return [["", this.#input]];
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return this.#evaluate(this.#input);
  }

  #evaluate(step: Step): EitherValueOrError {
    const [value, err] = step.result;
    if (err) return [null, err];
    if (Array.isArray(value)) return this.#evaluateList(value);
    if (value instanceof Value_Closure || value instanceof Value_Captured) {
      return [null, new RuntimeError_BadFinalResult(getTypeNameOfValue(value))];
    }
    if (step instanceof Value_Calling) throw new Unreachable();
    return [value, null];
  }

  #evaluateList(list: Step[]): EitherValueOrError {
    for (const elem of list) {
      let _: Value | null;
      let err: null | RuntimeError;
      if (Array.isArray(elem)) {
        [_, err] = this.#evaluateList(elem);
      } else {
        [_, err] = this.#evaluate(elem);
      }
      if (err) return [null, err];
    }
    return [list, null];
  }
}

function getCallingInitialSteps(
  calleeName: string,
  args: Step[],
  style: RegularCallStyle | "value",
): TextStepPair[] {
  if (args.length === 0) {
    if (style === "operator") throw new Unreachable();
    return [[`${calleeName}()`, null]];
  }

  if (style === "operator") {
    if (args.length === 1) return [[calleeName, args[0]]];
    if (args.length !== 2) throw new Unreachable();
    return [["", args[0]], [`${ws}${calleeName}${ws}`, args[1]]];
  }

  const body = args
    .map((arg) => [`,${ws}`, arg]) as TextStepPair[];
  if (style === "function") {
    body[0][0] = `${calleeName}(`;
  } else {
    if (style !== "value") throw new Unreachable();
    body[0][0] = `(${calleeName}).(`;
  }
  body.push([")", null]);
  return body;
}
