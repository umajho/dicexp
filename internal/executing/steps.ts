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
  Value_Generating,
  ValueTypeName,
} from "./values.ts";

export type EitherValueOrError = [Value, null] | [null, RuntimeError];
export type EitherValueOrErrorOrMismatch<T extends Value> =
  | [T, null]
  | [null, RuntimeError | { actualType: ValueTypeName }];

export type EitherValuesOrError = [Value[], null] | [null, RuntimeError];

export type EitherStepOrError = [Step, null] | [null, RuntimeError];

// FIXME: 应该使用精瘦后的 Step，否则只有在完全执行完这些对象才会被垃圾回收
type TextStepPair = [string, Step | null];

export const ws = "{s}";

export abstract class Step {
  constructor(
    /**
     * - Value: 已经 evaluate 到了值
     * - undefined: 尚未 evaluate
     * - null: evaluate 返回了错误
     */
    private _result?: EitherValueOrError,
  ) {}

  protected cloneBase(): Step {
    const clone = Object.assign(
      Object.create(Object.getPrototypeOf(this)),
      this,
    );
    clone._result = undefined;
    return clone;
  }
  abstract clone(): Step;

  get result(): EitherValueOrError {
    return this._evaluateAndMemorize(true);
  }
  renderResultText(): string | null {
    if (this._result === undefined) return "_";
    const [value, _] = this.result;
    if (value === null) return null;
    return renderValue(value);
  }

  /**
   * 如果不为 null，则要渲染当前 step 时用这里的值代替渲染。
   */
  replacedBy: Step | null = null;

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

  protected abstract evaluate(): EitherValueOrError;
  private _evaluateAndMemorize(evaluatesCalling: boolean): EitherValueOrError {
    if (this._result === undefined) {
      this._result = this.evaluate();
    }
    if (evaluatesCalling) {
      OUT:
      while (true) {
        const [value, error] = this._result;
        if (error) break;
        switch (getTypeNameOfValue(value)) {
          case "calling": {
            const calling = value as Value_Calling;
            this._result = calling.call();
            break;
          }
          case "generating": { // TODO
            const step = (value as Value_Generating).makeStep();
            // FIXME: 步骤丢失
            this._result = step.evaluate();
            break OUT;
          }
          default:
            break OUT;
        }
      }
    }
    return this._result;
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
    const result = this._evaluateAndMemorize(false);
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
  constructor(
    private _value: Value,
  ) {
    super();
  }

  clone(): Step {
    return this.cloneBase();
  }

  getInitialSteps = undefined;
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return [this._value, null];
  }
}

// TODO: Step_Erased，屏蔽掉过往的步骤，但保留惰性

type LiteralValue = number | boolean | Value_Closure | Value_Captured;
export class Step_Literal extends Step {
  constructor(
    private _value: LiteralValue,
  ) {
    super();
  }

  clone(): Step {
    return this.cloneBase();
  }

  getInitialSteps = undefined;
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return [this._value, null];
  }
}

export class Step_Identifier extends Step {
  constructor(
    public identifier: string,
    private _stepOrError: Step | RuntimeError,
  ) {
    super();
  }

  clone(): Step {
    return this.cloneBase();
  }

  getInitialSteps(): TextStepPair[] {
    return [[this.identifier, null]];
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    if (this._stepOrError instanceof RuntimeError) {
      return [null, this._stepOrError];
    }
    return this._stepOrError.result;
  }
}

export class Step_LiteralList extends Step {
  constructor(
    private _value: Step[],
  ) {
    super();
  }

  clone(): Step {
    const base = this.cloneBase() as Step_LiteralList;
    base._value = base._value.map((el) => el.clone());
    return base;
  }

  getInitialSteps(): TextStepPair[] {
    if (!this._value.length) return [["[]", null]];
    const body = this._value
      .map((elem) => [`,${ws}`, elem]) as TextStepPair[];
    body[0][0] = "[";
    body.push(["]", null]);
    return body;
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return [this._value, null];
  }
}

export class Step_RegularCall extends Step {
  private _f: Evaluator;

  constructor(
    scope: Scope,
    private _name: string, // FIXME: 这时就可以确认函数是否存在了，应该 eager
    private _args: Step[],
    private _style: RegularCallStyle,
    runtime: FunctionRuntime,
  ) {
    super();

    this._f = makeRegularCallEvaluator(scope, this._name, undefined, runtime);
  }

  clone(): Step {
    const base = this.cloneBase() as Step_RegularCall;
    base._args = base._args.map((el) => el.clone());
    return base;
  }

  getInitialSteps(): TextStepPair[] {
    return getCallingInitialSteps(this._name, this._args, this._style);
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    const replacingCb = (step: Step) => this.replacedBy = step;
    return [
      new Value_Calling(this._f, undefined, this._args, replacingCb),
      null,
    ];
  }
}

export class Step_ValueCall extends Step {
  private _calleeName: string | undefined = undefined;

  constructor(
    private _callee: Step,
    private _args: Step[],
  ) {
    super();
  }

  clone(): Step {
    const base = this.cloneBase() as Step_ValueCall;
    base._callee = base._callee.clone();
    base._args = base._args.map((el) => el.clone());
    return base;
  }

  getInitialSteps(): TextStepPair[] {
    const calleeName = this._calleeName ?? "_";
    return getCallingInitialSteps(calleeName, this._args, "value");
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    const [value, err] = this._callee.result;
    if (err) return [value, err];

    if (!(value instanceof Value_Callable)) {
      return [null, new RuntimeError_NotCallable(renderValue(value))];
    }
    this._calleeName = value.name;

    return [value.makeCalling(this._args), null];
  }
}

// export class Step_CreateGenerator extends Step {
//   protected evaluate(): EitherValueOrError {
//     throw new Unreachable();
//   }

//   getInitialSteps(): TextStepPair[] {
//     throw new Unimplemented();
//   }
//   getIntermediateSteps = undefined;
// }

export type GeneratorCallback =
  | { kind: "simple_number"; fn: () => number }
  | { kind: "step"; fn: () => EitherStepOrError };

export class Step_Generate extends Step {
  constructor(
    public readonly outputForm: Value_Generating["outputForm"],
    public readonly elementCount: number,
    public readonly elementType: Value_Generating["elementType"],
    private _elementGenerator: GeneratorCallback,
    public readonly elementRange: [number, number] | null,
  ) {
    super();
  }

  clone(): Step {
    return this.cloneBase();
  }

  getInitialSteps(): TextStepPair[] {
    throw new Unimplemented(); // TODO
  }
  getIntermediateSteps(): TextStepPair[] {
    throw new Unimplemented(); // TODO
  }

  evaluate(): EitherValueOrError {
    const seq: number[] = Array(this.elementCount);
    for (let i = 0; i < this.elementCount; i++) {
      const [n, err] = this.generateNumberElement();
      if (err) {
        return [null, err];
      }
      seq[i] = n;
    }

    switch (this.outputForm) {
      case "sum": {
        return [seq.reduce((acc, cur) => acc + cur), null];
      }
      case "sequence":
        return [seq.map((el) => new Step_Plain(el)), null];
      default:
        throw new Unreachable();
    }
  }

  generateNumberElement(): [number, null] | [null, RuntimeError] {
    if (this._elementGenerator.kind === "simple_number") {
      return [this._elementGenerator.fn(), null];
    }
    const [step, errStep] = this._elementGenerator.fn();
    if (errStep) return [null, errStep];
    const [value, errValue] = step.number;
    if (errValue instanceof RuntimeError) return [null, errValue];
    if (errValue) throw new Unreachable();
    return [value, null];
  }
}

// export class Step_Repeat extends Step {
// }

/**
 * 确保如果 result 没有错误，其中的 step 都已执行（不会返回错误）。
 */
export class Step_Final extends Step {
  constructor(
    private _input: Step,
  ) {
    super();
  }

  clone(): Step {
    const base = this.cloneBase() as Step_Final;
    base._input = base._input.clone();
    return base;
  }

  getInitialSteps(): TextStepPair[] {
    return [["", this._input]];
  }
  getIntermediateSteps = undefined;

  protected evaluate(): EitherValueOrError {
    return this._evaluate(this._input);
  }

  private _evaluate(step: Step): EitherValueOrError {
    const [value, err] = step.result;
    if (err) return [null, err];
    if (Array.isArray(value)) return this._evaluateList(value);
    if (value instanceof Value_Closure || value instanceof Value_Captured) {
      return [null, new RuntimeError_BadFinalResult(getTypeNameOfValue(value))];
    }
    if (step instanceof Value_Calling) throw new Unreachable();
    return [value, null];
  }

  private _evaluateList(list: Step[]): EitherValueOrError {
    for (const elem of list) {
      let _: Value | null;
      let err: null | RuntimeError;
      if (Array.isArray(elem)) {
        [_, err] = this._evaluateList(elem);
      } else {
        [_, err] = this._evaluate(elem);
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
