import { precedenceTable } from "@dicexp/lezer";

import { Repr, ReprInRuntime } from "./types";
import { createRepr } from "./factory";

export function finalizeRepr(rtmRepr: ReprInRuntime | Repr): Repr {
  switch (/* type */ rtmRepr[0]) {
    case "@":
      return finalizeRepr(rtmRepr[1]());
    case "r":
    case "_":
    case "vp":
    case "vs":
    case "c$":
    case "&":
    case "E":
      return rtmRepr;
    case "vl@":
      const items = rtmRepr[1]().map((item) => finalizeRepr(item));
      const containsError = rtmRepr[2]();
      const surplusItems = rtmRepr[3]?.()?.map((item) => finalizeRepr(item));
      return ["vl", items, containsError, surplusItems];
    case "vs@":
      const sum = rtmRepr[1]();
      const addends = rtmRepr[2]().map((item) => finalizeRepr(item));
      const surplusAddends = rtmRepr[3]?.()?.map((item) => finalizeRepr(item));
      return ["vs", sum, addends, surplusAddends];
    case "i":
      if (!(/* value */ rtmRepr[2])) return rtmRepr as Repr;
      return ["i", rtmRepr[1], finalizeRepr(rtmRepr[2])];
    case "cr@":
      const args = rtmRepr[3]?.map((arg) => finalizeRepr(arg()));

      return tryCreateReprForCallGroupOfOperatorsWithSamePrecedence(
        rtmRepr,
        args,
      ) ?? [
        "cr",
        rtmRepr[1], // style
        rtmRepr[2], // callee
        args,
        rtmRepr[4] && finalizeRepr(rtmRepr[4]), // result
      ];
    case "cv@":
      return [
        "cv",
        rtmRepr[1], // style
        finalizeRepr(rtmRepr[2]), // callee
        rtmRepr[3] && rtmRepr[3].map((arg) => finalizeRepr(arg())), // args
        rtmRepr[4] && finalizeRepr(rtmRepr[4]), // result
      ];
    case "#":
      return [
        "#",
        finalizeRepr(rtmRepr[1]), // count
        rtmRepr[2], // body
        rtmRepr[3] && finalizeRepr(rtmRepr[3]), //result
      ];
    case "e":
      return [
        "e",
        rtmRepr[1], // error
        rtmRepr[2] && finalizeRepr(rtmRepr[2]), // source
      ];
    case "d":
      return ["d", rtmRepr[1], finalizeRepr(rtmRepr[2])];
  }
  return rtmRepr;
}

function tryCreateReprForCallGroupOfOperatorsWithSamePrecedence(
  repr: ReprInRuntime & { 0: "cr@" },
  args: Repr[] | undefined,
): (Repr & { 0: "c$" }) | null {
  if (/* style */ repr[1] !== "o" || args?.length !== 2) return null;

  const lArg = args[0]!; // left argument
  const curCallee = repr[2];
  const curPrec: number | undefined = precedenceTable[`${curCallee}/2`];

  if (lArg[0] === "cr") {
    const lArgArgs = lArg[3]!;
    if (lArgArgs?.length !== 2) return null;

    const lCallee = lArg[2];
    const lPrec: number | undefined = precedenceTable[`${lCallee}/2`];
    if (lPrec !== curPrec) return null;

    return createRepr.calls_ord_bin_op(
      lArgArgs[0]!,
      [[lCallee, lArgArgs[1]!], [curCallee, args[1]!]],
      (/* result */ repr[4]) && finalizeRepr(repr[4]),
    );
  } else if (lArg[0] === "c$") {
    const lTail = lArg[2];
    const lCallee = lTail[0]![0];
    const lPrec: number | undefined = precedenceTable[`${lCallee}/2`];
    if (lPrec !== curPrec) return null;

    lTail.push([curCallee, args[1]!]);
    lArg[3] = (/* result */ repr[4]) && finalizeRepr(repr[4]);

    return lArg;
  }

  return null;
}
