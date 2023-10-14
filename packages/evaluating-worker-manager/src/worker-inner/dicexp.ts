import type { asRuntimeError, evaluate, execute, parse } from "dicexp/internal";

export interface Dicexp {
  parse: typeof parse;
  execute: typeof execute;
  evaluate: typeof evaluate;
  asRuntimeError: typeof asRuntimeError;
}

let dicexp!: Dicexp;

export function setDicexp(dicexp_: Dicexp) {
  dicexp = dicexp_;
}

export function getDicexp() {
  return dicexp;
}
