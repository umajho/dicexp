import { makeScope } from "@dicexp/runtime/regular-functions";
import type { Scope } from "@dicexp/runtime/values";
import { builtinOperatorDeclarations } from "./src/base/operators/declarations";
import { builtinOperatorDefinitions } from "./src/base/operators/definitions";
import { builtinFunctionDeclarations } from "./src/base/functions/declarations";
import { builtinFunctionDefinitions } from "./src/base/functions/definitions";

export {
  builtinFunctionDeclarations,
  builtinFunctionDefinitions,
  builtinOperatorDeclarations,
  builtinOperatorDefinitions,
};

export const barebonesScope: Scope = {
  ...makeScope(builtinOperatorDeclarations, builtinOperatorDefinitions),
};

export const standardScope: Scope = {
  ...barebonesScope,
  ...makeScope(builtinFunctionDeclarations, builtinFunctionDefinitions),
};
