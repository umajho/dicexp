import {
  concrete_error,
  LazyValue,
  RegularFunction,
  representValue,
  RuntimeProxyForFunction,
  RuntimeResult,
  Value,
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
  logic: (
    args: (LazyValue | Value)[],
    rtm: RuntimeProxyForFunction,
  ) => RuntimeResult<{ value: Value } | { lazy: LazyValue }>,
): RegularFunction {
  return (args_, rtm) => {
    const unwrapResult = unwrapArguments(spec, args_, rtm);
    if ("error" in unwrapResult) {
      return { error: unwrapResult.error };
    }

    return {
      ok: {
        _yield: () => {
          const result = logic(unwrapResult.ok.values, rtm);
          if ("error" in result) {
            return concrete_error(result.error);
          }

          if ("lazy" in result.ok) {
            return result.ok;
          }

          return {
            value: { ok: result.ok.value },
            representation: representValue(result.ok.value),
          };
        },
      },
    };
  };
}

function unwrapArguments(
  spec: ValueSpec[],
  args: LazyValue[],
  rtm: RuntimeProxyForFunction,
): RuntimeResult<{ values: (LazyValue | Value)[] }> {
  if (spec.length !== args.length) {
    return { error: runtimeError_wrongArity(spec.length, args.length) };
  }

  const values: (LazyValue | Value)[] = Array(args.length);

  for (const [i, arg] of args.entries()) {
    const result = unwrapValue(spec[i], arg, rtm, { nth: i + 1 });
    if ("error" in result) return result;
    const { value } = result.ok;
    values[i] = value;
  }

  return { ok: { values } };
}
