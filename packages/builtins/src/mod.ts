import { makeRawScope } from "@dicexp/runtime/values";
import { makeScope } from "@dicexp/runtime/regular-functions";

import { ScopeExplicit } from "./types";

import { builtinOperatorDeclarations as operatorDeclarations } from "./base/operators/declarations";
import { builtinOperatorDefinitions as operatorDefinitions } from "./base/operators/definitions";
import { builtinOperatorDocumentations as operatorDocumentations } from "./base/operators/documentations";
import { builtinFunctionDeclarations as functiondDeclarations } from "./base/functions/declarations";
import { builtinFunctionDefinitions as functionDefinitions } from "./base/functions/definitions";
import { builtinFunctionDocumentations as functionDocumentations } from "./base/functions/documentations";

// operators

export { operatorDeclarations, operatorDefinitions, operatorDocumentations };
export const operatorRawScope = makeRawScope(
  operatorDeclarations,
  operatorDefinitions,
);
export const operatorScope = makeScope(operatorRawScope) as ScopeExplicit<
  typeof operatorDefinitions
>; // 包含运算符的作用域

// functions

export { functiondDeclarations, functionDefinitions, functionDocumentations };
export const functionRawScope = makeRawScope(
  functiondDeclarations,
  functionDefinitions,
);
export const functionScope = makeScope(functionRawScope) as ScopeExplicit<
  typeof functionDefinitions
>; // 包含非运算符函数的作用域
