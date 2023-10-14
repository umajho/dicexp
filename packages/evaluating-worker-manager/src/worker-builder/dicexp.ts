export interface Dicexp {
  parse: typeof import("dicexp").parse;
  execute: typeof import("dicexp").execute;
  evaluate: typeof import("dicexp").evaluate;
  asRuntimeError: typeof import("dicexp").asRuntimeError;
}

let dicexp!: Dicexp;

export function setDicexp(dicexp_: Dicexp) {
  dicexp = dicexp_;
}

export function getDicexp() {
  return dicexp;
}
