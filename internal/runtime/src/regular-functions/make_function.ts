import { Unreachable } from "@dicexp/errors";

import {
  createValueBox,
  makeRuntimeError,
  RawFunction,
  RegularFunction,
  RuntimeError,
  Value,
  ValueBox,
  ValueSpec,
} from "../values/mod";
import { runtimeError_wrongArity } from "../errors/mod";
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
    if (unwrapResult[0] === "error" || unwrapResult[0] === "error_indirect") {
      return createValueBox.error(unwrapResult[1], {
        indirect: unwrapResult[0] === "error_indirect",
      });
    } else { // unwrapResult[0] === "ok"
      return createValueBox.lazy(() => {
        const result = logic(rtm, ...unwrapResult[1]);
        if (result[0] === "ok") {
          return createValueBox.value(result[1]);
        } else if (result[0] === "lazy") {
          return result[1];
        } else if (result[0] === "error") {
          let err = result[1];
          if (typeof err === "string") {
            err = makeRuntimeError(err);
          }
          return createValueBox.error(err);
        } else if (result[0] === "error_indirect") {
          return createValueBox.error(result[1], { indirect: true });
        } else {
          result[0] satisfies never;
          throw new Unreachable();
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
):
  | ["ok", (Value | ValueBox)[]]
  | ["error", RuntimeError]
  | ["error_indirect", RuntimeError] {
  if (spec.length !== args.length) {
    // NOTE: 实际上触发不了这里，因为对于通常函数而言，参数数目决定目标函数名，
    //       而参数数目不正确会因为找不到函数名对应的函数而先触发对应的错误。
    const err = runtimeError_wrongArity(spec.length, args.length, "regular");
    return ["error", err];
  }

  const result: (Value | ValueBox)[] = Array(args.length);

  for (let [i, arg] of args.entries()) {
    const unwrapResult = unwrapValue(spec[i]!, arg, { nth: i + 1 });
    if (unwrapResult[0] === "error" || unwrapResult[0] === "error_indirect") {
      return unwrapResult;
    } else { // unwrapResult[0] === "ok"
      result[i] = unwrapResult[1];
    }
  }

  return ["ok", result];
}
