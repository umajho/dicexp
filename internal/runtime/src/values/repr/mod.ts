import { RuntimeError } from "../runtime_errors";
import { Value, Value_List } from "../values";
import { Unreachable } from "@dicexp/errors";

/**
 * Repr 指 Representation
 */
export abstract class Repr {
  finalize() {}
}

export function createReprOfValue(value: Value): Repr {
  if (typeof value === "number" || typeof value === "boolean") {
    return new ReprValuePrimitive(value);
  } else if (Array.isArray(value)) {
    return new ReprValueList(value);
  } else if (value.type === "list$extendable") {
    return new ReprValueList(value._asList());
  } else if (value.type === "integer$sum_extendable") {
    return new ReprValueSum(value._sum());
  } else {
    value.type satisfies "callable";
    return value.representation;
  }
}

/**
 * 如：`42`。
 *
 * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`1+1`。
 */
export class ReprValuePrimitive extends Repr {
  constructor(
    readonly value: number | boolean,
  ) {
    super();
  }
}

/**
 * 如：`[1, 2, 3]`。
 *
 * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`[1]++[1]`（TODO：尚未实现）。
 */
export class ReprValueList extends Repr {
  items: ["lazy", (() => Repr)[]] | ["final", Repr[]];

  constructor(list: Value_List) {
    super();
    this.items = ["lazy", list.map((v) => () => v.getRepr())];
  }

  finalize(): void {
    if (this.items[0] !== "lazy") throw new Unreachable();
    const finalItems = this.items[1].map((item) => item());
    this.items = ["final", finalItems];
  }
}

/**
 * 如：`42`。
 */
export class ReprValueSum extends Repr {
  constructor(
    readonly sum: number,
  ) {
    super();
  }
}

/**
 * 如：`\($x -> -$x)`。
 *
 * 位于运算符（包括 `|>`、`.`）的一侧时无需括号包围，如：`\(_ -> 42).()`。
 */
export class ReprRaw extends Repr {
  constructor(
    readonly raw: string,
  ) {
    super();
  }
}

/**
 * 如：`$foo=42`。
 *
 * 位于运算符（包括 `|>`）的一侧时需要括号包围，如：`($foo=42) + 1`。
 */
export class ReprIdentifier extends Repr {
  constructor(
    readonly name: string,
    /**
     * 若不存在，代表还没处理到值就遇到了错误。
     */
    readonly value?: Repr,
  ) {
    super();
  }

  finalize(): void {
    this.value?.finalize();
  }
}

/**
 * 如（示例中大括号代表可折叠部分）：
 * - 字面单目运算符：`+3`、`-3`。
 * - 单目运算符：`{d3 -> }2`。
 * - 双目运算符：`{3+7 = }10`、`{3d7 -> }20`。
 * - 通常函数调用：[^1]。
 *   - `{filter([3, 7], \($x -> $x > 5)) = }[7]`。
 *   - `{filter([3, 7], \(_ -> d2 > 1)) -> }[7]`。
 * - 通常函数调用（管道）：`{[3, 7] |> sum -> }10`。
 *
 * [^1]: TODO: 可以让部分函数显示中间步骤。
 *
 * 位于运算符（包括 `|>`）的一侧时需要括号包围，如：`(1+2 = 3) * 3`。
 * 注：相同优先级的运算符连在一起时会合并为 `ReprGroupedOperatorCalls`。
 */
export class ReprRegularCall extends Repr {
  constructor(
    readonly style: "function" | "operator" | "piped",
    readonly callee: string,
    /**
     * 若为不存在，代表还没处理到参数就遇到了错误。
     */
    readonly args?: Repr[],
  ) {
    super();
  }

  finalize(): void {
    this.args?.map((arg) => arg.finalize());
  }
}

/**
 * 如（示例中大括号代表可折叠部分）：
 * - 闭包调用：`{\($x -> -$x).(42) = }-42`。
 * - 闭包调用（管道）：`{[3, 7] |> $sum.() -> }10`。
 * - 捕获调用（含管道）略。
 */
export class ReprValueCall extends Repr {
  constructor(
    readonly style: "function" | "piped",
    readonly callee: Repr,
    /**
     * 若为不存在，代表还没处理到参数就遇到了错误。
     */
    readonly args?: Repr[],
  ) {
    super();
  }

  finalize(): void {
    this.callee.finalize();
    this.args?.map((arg) => arg.finalize());
  }
}

/**
 * 同优先级的运算符连在一起，无需括号。
 * 如：`1+2+3-4 -> 2` 而非 `((1+2 -> 3) + 3 -> 6) - 4 -> 2`。
 *
 * 自身之外，位于运算符（包括 `|>`）的一侧时需要括号包围，如：`(1+2+3 = 6) * 3`。
 */
export class ReprGroupedOperatorCalls extends Repr {
  constructor(
    readonly head: Repr,
    readonly rest: [string, Repr][],
  ) {
    super();
  }

  finalize(): void {
    this.head.finalize();
  }
}

/**
 * 如：`&+/2`。
 *
 * 位于运算符（包括 `|>`、`.`）的一侧时需要括号包围，如：`(&+/2).(1, 2)`。
 */
export class ReprCapture extends Repr {
  constructor(
    readonly name: string,
    readonly arity: number,
  ) {
    super();
  }
}

export class ReprRepetition extends Repr {
  constructor(
    readonly count: Repr,
    readonly bodyRaw: string,
  ) {
    super();
  }

  finalize(): void {
    this.count.finalize();
  }
}

export class ReprError extends Repr {
  constructor(
    /**
     * - `direct`: 错误引发自这里。
     *   比如，对于不曾定义的 `$foo`，`$foo+1` 这一步并非引发错误的地方，
     *   而其内部的 `$foo` 是引发错误的地方。
     * - `deep`: 错误来自更深层的地方，只在且必须在 “能记录的步骤超过上限” 的地方出现错误时使用，
     *   以确保错误信息不会被漏掉。
     */
    readonly sub_type: "direct" | "deep",
    readonly error: RuntimeError,
    readonly source?: Repr,
  ) {
    super();
  }

  finalize(): void {
    this.source?.finalize();
  }
}

// /**
//  * 在超过记录步骤的上限后，深处的错误仍然要有记录。以此种方式传达。
//  */
// export class RepreDeepErrors extends Repr {
//   constructor(
//     readonly errors: RuntimeError,
//   ) {
//     super();
//   }
// }
