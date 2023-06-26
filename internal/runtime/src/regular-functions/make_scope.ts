import type { RawScope, Scope, ValueSpec } from "../values/mod";
import type { RegularFunctionDeclaration } from "./decl-def";
import { makeFunction } from "./make_function";

export function makeScope(rawScope: RawScope): Scope {
  const opScope: Scope = {};

  for (const decl_ of rawScope.declarations) {
    const decl = decl_ as RegularFunctionDeclaration;
    const fullName = `${decl.name}/${decl.parameters.length}`;
    const argSpec = decl.parameters.map((param) =>
      param.type === "$lazy" ? "lazy" : param.type
    );
    const impl = rawScope.definitions[fullName];
    opScope[fullName] = makeFunction(
      argSpec as ValueSpec[],
      (args, rtm) => impl(rtm, ...args),
    );
  }

  return opScope;
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
