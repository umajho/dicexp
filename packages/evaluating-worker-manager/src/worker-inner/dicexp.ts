import { Dicexp as DicexpBase } from "@dicexp/interface";
import { Node } from "@dicexp/nodes";
import { Scope } from "@dicexp/runtime/scopes";

import type { evaluate, execute, parse } from "dicexp/internal";

export interface Dicexp extends DicexpBase<Node, Scope> {
  parse: typeof parse;
  execute: typeof execute;
  evaluate: typeof evaluate;
}

let dicexp!: Dicexp;

export function setDicexp(dicexp_: Dicexp) {
  dicexp = dicexp_;
}

export function getDicexp() {
  return dicexp;
}
