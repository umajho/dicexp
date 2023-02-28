import {
  functionCall,
  FunctionCallStyle,
  Node,
  Node_Value,
  NodeValue_Closure,
} from "../parsing/building_blocks.ts";
import {
  asLazy,
  ConcreteValue,
  concreteValue,
  ErrorValue,
  errorValue,
  getTypeName,
  LazyValue,
  RuntimeValue,
  RuntimeValueTypes,
  Step,
} from "./evaluated_values.ts";
import {
  RuntimeError,
  RuntimeError_TypeMismatch,
  RuntimeError_WrongArity,
} from "./runtime_errors.ts";
import { Function, FunctionRuntime } from "./runtime.ts";
import { Unreachable } from "../../errors.ts";

export type AllowedParameterTypes =
  | RuntimeValueTypes
  | RuntimeValueTypes[]
  | "*";

/**
 * TODO: types 应该允许同一个参数可以是指定的多种类型
 *
 * @param functionName
 * @param paramTypes
 * @param logic
 * @returns
 */
export function makeFunction(
  functionName: string,
  paramTypes: AllowedParameterTypes[],
  logic: (
    args: ConcreteValue[],
    runtime: FunctionRuntime,
  ) => ConcreteValue["value"] | ErrorValue["error"] | LazyValue,
): Function {
  return (params, style, runtime) => {
    const [
      evaluatedParams,
      error,
    ] = evaluateParameters(runtime.evaluate, functionName, params, paramTypes);

    if (error !== null) {
      if (evaluatedParams !== null) {
        // FIXME: 这里感觉有些乱，`makeFunction` 与 `evaluateParameters` 耦合得很紧。
        return {
          result: errorValue(
            error,
            renderFunctionStep(
              functionName,
              evaluatedParams,
              style,
            ),
          ),
        };
      }
      return { result: errorValue(error) };
    }

    const resultValue = logic(evaluatedParams, runtime);
    let result: RuntimeValue;
    if (resultValue instanceof RuntimeError) {
      const step = renderFunctionStep(functionName, evaluatedParams, style);
      result = errorValue(resultValue, step);
    } else if (
      typeof resultValue === "object" && "kind" in resultValue
    ) {
      if (resultValue.kind !== "lazy") throw new Unreachable();
      result = resultValue;
    } else {
      // TODO: 数字超过范围要不要也在这里处理，还是调用这个闭包的函数处理？
      const step = renderFunctionStep(functionName, evaluatedParams, style);
      result = concreteValue(resultValue, step);
    }
    return { result };
  };
}

export function makeUnaryRedirection(
  functionName: string,
  leftValue: Node_Value,
): Function {
  return (params, _style, runtime) => {
    const redirected = functionCall(
      functionName,
      [leftValue, params[0]],
      "operator",
      2,
    );
    const binaryResult = invokeAll(runtime.evaluate(redirected));
    let result: RuntimeValue;
    if (binaryResult.kind === "concrete") {
      result = concreteValue(binaryResult.value, [
        "TODO: redirection step",
        binaryResult.step,
      ]);
    } else {
      result = errorValue(binaryResult.error, [
        "TODO: redirection step",
        binaryResult.step,
      ]);
    }
    return { result };
  };
}

type ListElementWithError = ConcreteValue | ErrorValue | Unevaluated;

export function evaluateParameters(
  evalFn: (node: Node) => RuntimeValue,
  functionName: string,
  params: Node[],
  types: AllowedParameterTypes[],
):
  | [ListElementWithError[] | null, RuntimeError]
  | [ConcreteValue[], null] {
  if (params.length != types.length) {
    return [
      null,
      new RuntimeError_WrongArity(functionName, types.length, params.length),
    ];
  }

  const evaluatedParams: ListElementWithError[] = [];
  let paramError: RuntimeError | null = null;
  for (const [i, param] of params.entries()) {
    if (paramError) {
      evaluatedParams.push(unevaluated());
      continue;
    }
    const evaluated = invokeAll(evalFn(param));
    if (evaluated.kind === "error") {
      evaluatedParams.push(evaluated);
      paramError = evaluated.error;
      continue;
    }

    const typeError = checkTypes(types[i], evaluated);
    if (typeError) {
      evaluatedParams.push(errorValue(typeError));
      paramError = typeError;
      continue;
    }

    evaluatedParams.push(evaluated);
  }

  if (paramError) {
    return [evaluatedParams, paramError];
  } else {
    const checked = evaluatedParams.map((v) => {
      if (v.kind === "concrete") return v;
      throw new Unreachable();
    });
    return [checked, null];
  }
}

interface Unevaluated {
  kind: "unevaluated";
  step: Step;
}
function unevaluated(): Unevaluated {
  return { kind: "unevaluated", step: ["_"] };
}

/**
 * FIXME: 这个函数目前只实现了一个概念版，尚待正式的实现。
 * TODO: 函数如果执行成功，结果也应该包含在这里。
 *
 * @param functionName
 * @param params 可以不够 `paramLength` 的长度，没有传入代表没有 evaluate。
 * @param paramLength
 * @param style
 * @returns
 */
function renderFunctionStep(
  functionName: string,
  params: ListElementWithError[],
  style: FunctionCallStyle,
): Step {
  if (style === "operator") {
    if (params.length === 1) {
      return [`(${functionName} `, params[0].step, ")"];
    } else if (params.length === 2) {
      return ["(", params[0].step, ` ${functionName} `, params[1].step, ")"];
    } else {
      throw new Unreachable();
    }
  }

  const [step, paramsRest]: [Step, ListElementWithError[]] = (() => {
    if (style === "piped") {
      return [["(", params[0].step, ` |> ${functionName}(`], params.slice(1)];
    } else {
      return [[`(${functionName}(`], params];
    }
  })();
  for (const [i, param] of paramsRest.entries()) {
    step.push(param.step);
    if (i != params.length - 1) {
      step.push(", ");
    }
  }
  step.push("))");
  return step;
}

export function invokeAll(
  evaluated: RuntimeValue,
): ConcreteValue | ErrorValue {
  const lazy = asLazy(evaluated);
  if (!lazy) return evaluated as (ConcreteValue | ErrorValue);

  const actuallyEvaluated = lazy.execute(lazy.args);

  return invokeAll(actuallyEvaluated);
}

function checkTypes(
  expected: AllowedParameterTypes,
  value: RuntimeValue,
): RuntimeError_TypeMismatch | null {
  if (expected === "*") return null;

  const actual = getTypeName(value);

  if (typeof expected === "string" && expected === actual) return null;
  if ((expected as string[]).includes(actual)) return null;

  return new RuntimeError_TypeMismatch(expected, actual);
}

type FlattenList = (number | boolean | NodeValue_Closure)[];

export function flattenListAll(
  list: ConcreteValue,
): FlattenList {
  return (list.value as ConcreteValue[]).flatMap((v) => {
    if (Array.isArray(v.value)) return flattenListAll(v);
    return v.value;
  });
}

export function testFlattenListType(
  list: FlattenList,
  expected: "number" | "boolean" | "closure",
) {
  for (const elem of list) {
    switch (expected) {
      case "number":
        if (typeof elem !== "number") return false;
        break;
      case "boolean":
        if (typeof elem !== "boolean") return false;
        break;
      case "closure":
        if (typeof elem !== "object") return false;
        if (elem.valueKind !== "closure") return false;
        break;
      default:
        throw new Unreachable();
    }
  }
  return true;
}
