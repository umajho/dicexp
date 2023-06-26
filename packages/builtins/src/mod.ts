import { makeScope } from "@dicexp/runtime/regular-functions";
import type { Scope } from "@dicexp/runtime/values";
import { builtinOperatorDeclarations } from "./base/operators/declarations";
import { builtinOperatorDefinitions } from "./base/operators/definitions";
import { builtinFunctionDeclarations } from "./base/functions/declarations";
import { builtinFunctionDefinitions } from "./base/functions/definitions";

export {
  builtinFunctionDeclarations,
  builtinFunctionDefinitions,
  builtinOperatorDeclarations,
  builtinOperatorDefinitions,
};

export const operatorScope = makeScope(
  builtinOperatorDeclarations,
  builtinOperatorDefinitions,
);

export const functionScope = makeScope(
  builtinFunctionDeclarations,
  builtinFunctionDefinitions,
);

export const barebonesScopeCollection: Scope[] = [operatorScope];
export const standardScopeCollection: Scope[] = [operatorScope, functionScope];
