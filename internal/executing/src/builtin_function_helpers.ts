import type { FunctionRuntime, RegularFunction } from "./runtime";
import {
  RuntimeError_CallArgumentTypeMismatch,
  RuntimeError_TypeMismatch,
  RuntimeError_WrongArity,
} from "./runtime_errors";
import {
  type EitherValueOrError,
  type EitherValuesOrError,
  Step,
  Step_Plain,
} from "./steps";
import { getTypeNameOfValue, type Value, type ValueTypeName } from "./values";

export type ExpectedValueTypeName = ValueTypeName | "callable";
type ArgumentSpec = ExpectedValueTypeName | "*" | ExpectedValueTypeName[];

export function makeFunction(
  spec: ArgumentSpec[],
  logic: (args: Value[], rtm: FunctionRuntime) => EitherValueOrError,
): RegularFunction {
  return (args_, rtm) => {
    const [args, errUnwrap] = unwrapArguments(spec, args_);
    if (errUnwrap) return [null, errUnwrap];
    const [resultValue, resultError] = logic(args, rtm);
    if (resultError) {
      return [null, resultError];
    } else {
      return [new Step_Plain(resultValue), null];
    }
  };
}

function unwrapArguments(
  spec: ArgumentSpec[],
  args: Step[],
): EitherValuesOrError {
  if (spec.length !== args.length) {
    return [null, new RuntimeError_WrongArity(spec.length, args.length)];
  }

  const values: Value[] = Array(args.length);

  for (const [i, arg] of args.entries()) {
    const [value, err] = unwrapValue(spec[i], arg, { nth: i + 1 });
    if (err) return [null, err];
    values[i] = value;
  }

  return [values, null];
}

export function unwrapValue(
  spec: ArgumentSpec,
  step: Step,
  opts?: CheckTypeOptions,
): EitherValueOrError {
  const [value, errEval] = step.result;
  if (errEval) return [null, errEval];

  const errType = checkType(spec, getTypeNameOfValue(value), opts);
  if (errType) return [null, errType];

  return [value, null];
}

interface CheckTypeOptions {
  nth?: number;
  kind?: RuntimeError_TypeMismatch["kind"];
}

function checkType(
  expected: ArgumentSpec,
  actual: ValueTypeName,
  opts: CheckTypeOptions = {},
): null | RuntimeError_TypeMismatch | RuntimeError_CallArgumentTypeMismatch {
  if (expected === "*") return null;
  if (Array.isArray(expected)) {
    if (expected.findIndex((x) => testType(x, actual)) >= 0) return null;
  } else if (testType(expected, actual)) {
    return null;
  }
  if (opts.nth !== undefined) {
    const nth = opts.nth;
    return new RuntimeError_CallArgumentTypeMismatch(nth, expected, actual);
  } else {
    return new RuntimeError_TypeMismatch(expected, actual, opts.kind ?? null);
  }
}

function testType(expected: ExpectedValueTypeName, actual: ValueTypeName) {
  if (expected === actual) return true;
  if (expected === "callable") {
    return actual === "closure" || actual === "captured";
  }
  return false;
}

/**
 * @param spec 除了列表之外其他的元素应该满足的规格
 * @param list
 */
export function flattenListAll(
  spec: ArgumentSpec,
  list: Step[],
): EitherValuesOrError {
  if (spec !== "*") {
    if (Array.isArray(spec)) {
      if (spec[spec.length - 1] !== "list") {
        spec = [...spec, "list"];
      }
    } else {
      spec = [spec, spec];
    }
  }

  const values: Value[] = [];

  for (const [i, elem] of list.entries()) {
    const [value, err] = unwrapValue(spec, elem);
    if (err) return [null, err];

    if (getTypeNameOfValue(value) === "list") {
      const [subList, errSubList] = flattenListAll(spec, value as Step[]);
      if (errSubList) return [null, errSubList];
      values.push(...subList);
    } else {
      values[i] = value;
    }
  }

  return [values, null];
}

// function unwrapList(spec: ArgumentSpec, list: Step[]): EitherValuesOrError {
//   const values: Value[] = Array(list.length);

//   for (const [i, elem] of list.entries()) {
//     const [value, err] = unwrapValue(spec, elem);
//     if (err) return [null, err];
//     values[i] = value;
//   }

//   return [values, null];
// }

/**
 * FIXME: 前后类型不一致时返回的错误不够清晰，应该明确是前后不一致造成的
 * @param specOneOf
 * @param list
 * @returns
 */
export function unwrapListOneOf(
  specOneOf: ValueTypeName[],
  list: Step[],
): EitherValuesOrError {
  if (!list.length) return [[], null];

  const values: Value[] = Array(list.length);
  let firstType: ValueTypeName;

  for (const [i, elem] of list.entries()) {
    let value, err;
    if (i === 0) {
      [value, err] = unwrapValue(specOneOf, elem);
    } else {
      [value, err] = unwrapValue(firstType!, elem, {
        kind: "list-inconsistency",
      });
    }
    if (err) return [null, err];
    if (i === 0) {
      firstType = getTypeNameOfValue(value!);
    }
    values[i] = value!;
  }

  return [values, null];
}
