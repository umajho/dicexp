import {
  RawFunction,
  RegularFunction,
  RuntimeError,
  Value,
  ValueBox,
  ValueBoxDircet,
  ValueBoxError,
  ValueBoxLazy,
  ValueSpec,
} from "../values/mod";
import {
  runtimeError_wrongArity,
  RuntimeErrorFromArgument,
} from "../errors/mod";
import { unwrapValue } from "../value-utils/mod";

/**
 * NOTE: 由于目前没有错误恢复机制，出现错误必然无法挽回，
 *       因此返回的错误都视为不会改变。
 *       如果未来要引入错误恢复机制，不要忘记修改与上述内容相关的代码。
 */
export function makeFunction(
  spec: ValueSpec[],
  logic: RawFunction,
): RegularFunction {
  return (args, rtm) => {
    const unwrapResult = unwrapArguments(spec, args);
    if (unwrapResult[0] === "error") {
      return new ValueBoxError(unwrapResult[1]);
    } else { // unwrapResult[0] === "ok"
      return new ValueBoxLazy(() => {
        const result = logic(rtm, ...unwrapResult[1]);
        if (result[0] === "ok") {
          return new ValueBoxDircet(result[1]);
        } else if (result[0] === "lazy") {
          return result[1];
        } else { // result[0] === "error"
          return new ValueBoxError(result[1]);
        }
      });
    }
  };
}

/**
 * NOTE: 返回值 `[values, err]` 中的 err 只代表这一步中的错误，
 *       而 `values` 中也可能存在错误。
 */
function unwrapArguments(
  spec: ValueSpec[],
  args: ValueBox[],
): ["ok", (Value | ValueBox)[]] | ["error", RuntimeError] {
  if (spec.length !== args.length) {
    return ["error", runtimeError_wrongArity(spec.length, args.length)];
  }

  const result: (Value | ValueBox)[] = Array(args.length);

  for (let [i, arg] of args.entries()) {
    const unwrapResult = unwrapValue(spec[i], arg, { nth: i + 1 });
    if (unwrapResult[0] === "error") {
      return ["error", new RuntimeErrorFromArgument(unwrapResult[1])];
    } else { // unwrapResult[0] === "ok"
      result[i] = unwrapResult[1];
    }
  }

  return ["ok", result];
}
