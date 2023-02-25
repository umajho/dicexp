import { FunctionCallStyle, Node } from "../parsing/building_blocks.ts";
import {
  asLazy,
  errored,
  EvaluatedValue,
  evaluatedValue,
  EvaluatedValueTypes,
  getTypeName,
  isErrored,
  Step,
  unevaluated,
} from "./evaluated_values.ts";
import {
  RuntimeError,
  RuntimeError_TypeMismatch,
  RuntimeError_WrongArity,
} from "./runtime_errors.ts";
import { Function } from "./runtime.ts";
import { Unreachable } from "../../errors.ts";

export type AllowedParameterTypes =
  | EvaluatedValueTypes
  | EvaluatedValueTypes[]
  | "*";

/**
 * TODO: types 应该允许同一个参数可以是指定的多种类型
 *
 * @param functionName
 * @param types
 * @param logic
 * @returns
 */
export function makeFunction(
  functionName: string,
  types: AllowedParameterTypes[],
  logic: (args: EvaluatedValue[]) => EvaluatedValue["value"],
): Function {
  return (evalFn, params, style) => {
    const [
      evaluatedParams,
      error,
    ] = evaluateParameters(evalFn, functionName, params, types);

    if (error !== null) {
      if (evaluatedParams !== null) {
        // FIXME: 这里感觉有些乱，`makeFunction` 与 `evaluateParameters` 耦合得很紧。
        return {
          result: errored(
            error,
            renderFunctionStep(functionName, evaluatedParams, style),
          ),
        };
      }
      return { result: errored(error) };
    }

    const result = logic(evaluatedParams);
    // TODO: 数字超过范围要不要也在这里处理，还是调用这个闭包的函数处理？
    const step = renderFunctionStep(functionName, evaluatedParams, style);
    const evaluatedResult = evaluatedValue(result, step);
    return { result: evaluatedResult };
  };
}

export function evaluateParameters(
  evalFn: (node: Node) => EvaluatedValue,
  functionName: string,
  params: Node[],
  types: AllowedParameterTypes[],
): [EvaluatedValue[] | null, RuntimeError] | [EvaluatedValue[], null] {
  if (params.length != types.length) {
    return [
      null,
      new RuntimeError_WrongArity(functionName, types.length, params.length),
    ];
  }

  const evaluatedParams: EvaluatedValue[] = [];
  let paramError: RuntimeError | null = null;
  for (const [i, param] of params.entries()) {
    if (paramError) {
      evaluatedParams.push(unevaluated());
      continue;
    }
    const evaluated = invokeAll(evalFn(param));
    if (isErrored(evaluated)) {
      evaluatedParams.push(evaluated);
      paramError = evaluated.value as unknown as RuntimeError;
      continue;
    }

    const typeError = checkTypes(types[i], evaluated);
    if (typeError) {
      evaluatedParams.push(errored(typeError));
      paramError = typeError;
      continue;
    }

    evaluatedParams.push(evaluated);
  }

  if (paramError) {
    return [evaluatedParams, paramError];
  }

  return [evaluatedParams, null];
}

/**
 * FIXME: 这个函数目前只实现了一个概念版，尚待正式的实现。
 * TODO: 函数如果执行成功，结果也应该包含在这里。
 *
 * @param functionName
 * @param params
 * @param style
 * @returns
 */
function renderFunctionStep(
  functionName: string,
  params: EvaluatedValue[],
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

  const [step, paramsRest]: [Step, EvaluatedValue[]] = (() => {
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

export function invokeAll(evaluated: EvaluatedValue): EvaluatedValue {
  const lazy = asLazy(evaluated);
  if (!lazy) return evaluated;

  const actuallyEvaluated = lazy.invoke(lazy.args);

  return invokeAll(actuallyEvaluated);
}

function checkTypes(
  expected: AllowedParameterTypes,
  value: EvaluatedValue,
): RuntimeError_TypeMismatch | null {
  if (expected === "*") return null;

  const actual = getTypeName(value);

  if (typeof expected === "string" && expected === actual) return null;
  if ((expected as string[]).includes(actual)) return null;

  return new RuntimeError_TypeMismatch(expected, actual);
}
