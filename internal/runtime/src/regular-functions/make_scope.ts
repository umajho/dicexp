import type { Scope, ValueSpec } from "../values/mod";
import type {
  DeclarationListToDefinitionMap,
  RegularFunctionDeclaration,
} from "./decl-def";
import { makeFunction } from "./make_function";

export function makeScope<T extends readonly RegularFunctionDeclaration[]>(
  declarations: T,
  definitions: DeclarationListToDefinitionMap<T>,
) {
  const opScope: Scope = {};

  for (const decl_ of declarations) {
    const decl = decl_ as RegularFunctionDeclaration;
    const fullName = `${decl.name}/${decl.parameters.length}`;
    const argSpec = decl.parameters.map((param) =>
      param.type === "$lazy" ? "lazy" : param.type
    );
    // @ts-ignore 类型推不出来了
    const impl = definitions[fullName];
    opScope[fullName] = makeFunction(
      argSpec as ValueSpec[],
      (args, rtm) => impl(rtm, ...args),
    );
  }

  return opScope;
}
