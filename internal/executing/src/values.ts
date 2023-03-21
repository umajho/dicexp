import { Unreachable } from "./errors";
import { Node } from "@dicexp/nodes";
import { FunctionRuntime, RegularFunctionReturnValue, Scope } from "./runtime";
import {
  RuntimeError,
  RuntimeError_DuplicateClosureParameterNames,
  RuntimeError_UnknownFunction,
  RuntimeError_WrongArity,
} from "./runtime_errors";
import {
  EitherValueOrError,
  GeneratorCallback,
  Step,
  Step_Generate,
  ws,
} from "./steps";

export type Value =
  | number
  | boolean
  | Step[]
  | Value_Closure
  | Value_Captured
  | Value_Calling
  | Value_Generating;
export type ValueTypeName = ReturnType<typeof getTypeNameOfValue>;

export abstract class Value_Callable {
  abstract name: string;
  abstract arity: number | undefined;
  abstract makeCalling(args: Step[]): Value_Calling;
}

export type Evaluator = (args: Step[]) => RegularFunctionReturnValue;

export class Value_Closure extends Value_Callable {
  get name() {
    return `《闭包：${getClosureId(this)}》`;
  }

  readonly arity;

  #f: Evaluator;

  constructor(
    scope: Scope,
    parameterIdentifiers: string[],
    body: Node,
    runtime: FunctionRuntime,
  ) {
    super();
    this.arity = parameterIdentifiers.length;

    this.#f = (args) => {
      // 在 Value_Calling.call 中已经检查过了
      if (args.length !== this.arity) throw new Unreachable();

      const deeperScope: Scope = Object.setPrototypeOf({}, scope);
      for (const [i, ident] of parameterIdentifiers.entries()) {
        if (ident === "_") continue;
        if (Object.prototype.hasOwnProperty.call(deeperScope, ident)) {
          return [null, new RuntimeError_DuplicateClosureParameterNames(ident)];
        }
        deeperScope[ident] = args[i];
      }

      return [runtime.evaluate(deeperScope, body), null];
    };
  }

  makeCalling(args: Step[]): Value_Calling {
    return new Value_Calling(
      this.#f,
      this.arity,
      args,
    );
  }
}

export class Value_Captured extends Value_Callable {
  readonly identifier: string;
  readonly arity: number;

  get name() {
    return `&${this.identifier}/${this.arity}`;
  }

  #f: Evaluator;

  constructor(
    scope: Scope,
    identifier: string,
    arity: number,
    runtime: FunctionRuntime,
  ) {
    super();
    this.identifier = identifier;
    this.arity = arity;

    this.#f = makeRegularCallEvaluator(scope, identifier, arity, runtime);
  }

  makeCalling(args: Step[]): Value_Calling {
    return new Value_Calling(
      this.#f,
      this.arity,
      args,
    );
  }
}

export class Value_Calling {
  #f: Evaluator;

  readonly expectedParameters?: number;
  args: Step[];

  #replaceStep: ((step: Step) => void) | null;

  constructor(
    f: Evaluator,
    expectedParameters: number | undefined,
    args: Step[],
    replaceStep: ((step: Step) => void) | null = null,
  ) {
    this.#f = f;
    this.expectedParameters = expectedParameters;
    this.args = args;
    this.#replaceStep = replaceStep;
  }

  withArgs(args: Step[]) {
    return new Value_Calling(
      this.#f,
      this.expectedParameters,
      args,
    );
  }

  call(): EitherValueOrError {
    if (
      this.expectedParameters !== undefined &&
      this.expectedParameters !== this.args.length
    ) {
      const err = new RuntimeError_WrongArity(
        this.expectedParameters,
        this.args.length,
      );
      return [null, err];
    }

    const result = this.#f(this.args);
    let step: Step | null, err: RuntimeError | null;
    if (Array.isArray(result)) {
      [step, err] = result;
    } else { // 只有通常函数才可能
      [step, err] = result.result;
      this.#replaceStep!(result.replacingStep);
    }

    if (err) return [null, err];
    return step!.result;
  }
}

export class Value_Generating {
  readonly outputForm: "sum" | "sequence";
  readonly elementCount: number;
  readonly elementType: "integer";
  readonly #elementGenerator: GeneratorCallback;
  readonly elementRange: [number, number] | null;

  constructor(
    form: Value_Generating["outputForm"],
    count: number,
    type: Value_Generating["elementType"],
    generator: GeneratorCallback,
    range: [number, number] | null,
  ) {
    this.outputForm = form;
    this.elementCount = count;
    this.elementType = type;
    this.#elementGenerator = generator;
    this.elementRange = range;
  }

  makeStep() {
    return new Step_Generate(
      this.outputForm,
      this.elementCount,
      this.elementType,
      this.#elementGenerator,
      this.elementRange,
    );
  }
}

export function getTypeNameOfValue(v: Value) {
  switch (typeof v) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      if (Array.isArray(v)) return "list";
      if (v instanceof Value_Closure) return "closure";
      if (v instanceof Value_Captured) return "captured";
      if (v instanceof Value_Calling) return "calling";
      if (v instanceof Value_Generating) return "generating";
      throw new Unreachable();
  }
}

export function renderValue(value: Value): string {
  switch (getTypeNameOfValue(value)) {
    case "number":
    case "boolean":
      return String(value);
    case "list": {
      const list = value as Step[];
      // NOTE: 返回列表的步骤没有错误，列表元素就也没有错误，因此不会是 null
      // TODO: 限制显示长度
      return "[" +
        list.map((s) => s.renderResultText()!).join(`,${ws}`) +
        "]";
    }
    case "closure":
      return (value as Value_Closure).name;
    case "captured": {
      const capture = value as Value_Captured;
      return `&${capture.identifier}/${capture.arity}`;
    }
    case "calling":
    case "generating":
      throw new Unreachable();
    default:
      throw new Unreachable();
  }
}

export function makeRegularCallEvaluator(
  scope: Scope,
  identifier: string,
  forceArity: number | undefined,
  runtime: FunctionRuntime,
): Evaluator {
  return (args) => {
    const fullName = `${identifier}/${args.length}`;

    if (forceArity !== undefined && args.length !== forceArity) {
      // 在 Value_Calling.call 中已经检查过了
      throw new Unreachable();
    }

    const fn = scope[fullName];
    if (fn === undefined) { // FIXME: 这种情况在调用外层函数时就能发现了，应该在那时处理
      return [null, new RuntimeError_UnknownFunction(fullName)];
    }
    if (typeof fn !== "function") throw new Unreachable();

    return fn(args, runtime);
  };
}

const getClosureId = (() => { // from https://stackoverflow.com/a/43963612
  let currentId = 0;
  const map = new WeakMap();

  return (closure: Value_Closure) => {
    if (!map.has(closure)) {
      map.set(closure, ++currentId);
    }

    return map.get(closure);
  };
})();
