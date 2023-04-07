import { type ArgumentSpec, makeFunction } from "./helpers";

import type { Scope } from "../runtime";
import { builtinOperatorDeclarations } from "./operators/declarations";
import { builtinOperatorDefinitions } from "./operators/definitions";
import type {
  DeclarationListToDefinitionMap,
  RegularFunctionDeclaration,
} from "../regular_functions";
import { builtinFunctionDeclarations } from "./functions/declarations";
import { builtinFunctionDefinitions } from "./functions/definitions";

export const builtinScope: Scope = {
  ...makeScope(builtinOperatorDeclarations, builtinOperatorDefinitions),
  ...makeScope(builtinFunctionDeclarations, builtinFunctionDefinitions),
};

function makeScope<T extends readonly RegularFunctionDeclaration[]>(
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
      argSpec as ArgumentSpec[],
      (args, rtm) => impl(rtm, ...args),
    );
  }

  return opScope;
}
