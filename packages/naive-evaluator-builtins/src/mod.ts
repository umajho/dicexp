import { makeRawScope, makeScope } from "@dicexp/runtime/scopes";

import { ScopeExplicit } from "./types";

import { builtinOperatorDeclarations as operatorDeclarations } from "./base/operators/declarations";
import { builtinOperatorDefinitions as operatorDefinitions } from "./base/operators/definitions";
import { builtinOperatorDocumentations as operatorDocumentations } from "./base/operators/documentations";
import { builtinFunctionDeclarations as functionDeclarations } from "./base/functions/declarations";
import { builtinFunctionDefinitions as functionDefinitions } from "./base/functions/definitions";
import { builtinFunctionDocumentations as functionDocumentations } from "./base/functions/documentations";

// operators

export { operatorDeclarations, operatorDefinitions, operatorDocumentations };
export const operatorScope = makeScope(
  makeRawScope(operatorDeclarations, operatorDefinitions),
) as ScopeExplicit<
  typeof operatorDefinitions
>; // 包含运算符的作用域

// functions

export { functionDeclarations, functionDefinitions, functionDocumentations };
export const functionScope = makeScope(
  makeRawScope(functionDeclarations, functionDefinitions),
) as ScopeExplicit<
  typeof functionDefinitions
>; // 包含非运算符函数的作用域
