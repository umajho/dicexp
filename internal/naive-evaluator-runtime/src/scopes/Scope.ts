import {
  RegularFunction,
  RegularFunctionDeclaration,
  RuntimeProxyForFunction,
} from "../regular-functions/mod";
import { RuntimeError } from "../runtime-errors/mod";
import { ValueBox } from "../value-boxes/mod";
import { Value } from "../values/mod";

import { makeScope } from "./make-scope";

export type Scope = {
  [ident: string]: RegularFunction | RegularFunctionAlias | ValueBox;
};

export type RawScope = {
  isRawScope: true;
  declarations: readonly RegularFunctionDeclaration[];
  definitions: Record<string, RawFunction>;
};

export type RawFunction = (
  rtm: RuntimeProxyForFunction,
  ...args: (Value | ValueBox)[]
) =>
  | ["ok", Value]
  | ["lazy", ValueBox]
  | ["error", RuntimeError | string]
  | ["error_indirect", RuntimeError];
// | ["error_from_argument", RuntimeError | string];

export class RegularFunctionAlias {
  constructor(public to: string) {}
}

export function asScope(stuff: Scope | RawScope | (Scope | RawScope)[]): Scope {
  if (Array.isArray(stuff)) {
    let scope: Scope = {};
    for (const item of stuff) {
      scope = { ...scope, ...asScope(item) };
    }
    return scope;
  } else if ("isRawScope" in stuff && stuff.isRawScope === true) {
    return makeScope(stuff as RawScope);
  } else {
    return stuff as Scope;
  }
}
