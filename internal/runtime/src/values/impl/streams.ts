import { Unreachable } from "@dicexp/errors";
import {
  StreamFragment,
  Value_Stream$List,
  Value_Stream$Sum,
  ValueBox,
} from "../mod";

export function createCreateStream<
  Type extends "stream$list" | "stream$sum",
  T = Type extends "stream$list" ? ValueBox : number,
>(type: Type) {
  return (
    yielder: () => [
      "ok" | "last" | "last_nominal",
      StreamFragment<T>,
    ],
    opts?: { initialNominalLength?: number },
  ): Type extends "stream$list" ? Value_Stream$List : Value_Stream$Sum => {
    type Yielded = ReturnType<typeof yielder>;
    const underlying: Yielded[] = //
      new Array(opts?.initialNominalLength ?? 0);
    let filled = 0, minimalPossibleNominalLength = opts?.initialNominalLength;
    function fill(toIndex: number): Yielded {
      let lastFilled: Yielded | null = null;
      for (let unfilledI = filled; unfilledI <= toIndex; unfilledI++) {
        if (!underlying[unfilledI]) {
          lastFilled = yielder();
          if (lastFilled[0] === "last" || lastFilled[0] === "last_nominal") {
            minimalPossibleNominalLength = unfilledI + 1;
          }
          underlying[unfilledI] = lastFilled;
        }
      }
      if (filled <= toIndex) {
        filled = toIndex + 1;
      }
      return lastFilled ?? underlying[toIndex]!;
    }

    // @ts-ignore
    return {
      type,
      _getMinimalPossibleNominalLength: () => minimalPossibleNominalLength,
      _getActualLength: () => filled,
      _at: (index: number) => {
        fill(index);
        const [returnType, [[_, valueBox]]] = fill(index);
        return [returnType, valueBox];
      },
      _fragmentAtForRepr: (index: number) => {
        const result = underlying[index];
        if (!result) throw new Unreachable();
        const [_, fragement] = result;
        return fragement;
      },
    };
  };
}
