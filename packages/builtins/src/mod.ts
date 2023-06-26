import { makeRawScope } from "@dicexp/runtime/values";
import { builtinOperatorDeclarations } from "./base/operators/declarations";
import { builtinOperatorDefinitions } from "./base/operators/definitions";
import { builtinOperatorDocumentations } from "./base/operators/documentations";
import { builtinFunctionDeclarations } from "./base/functions/declarations";
import { builtinFunctionDefinitions } from "./base/functions/definitions";
import { builtinFunctionDocumentations } from "./base/functions/documentations";
import { makeScope } from "@dicexp/runtime/regular-functions";

export {
  builtinFunctionDeclarations,
  builtinFunctionDefinitions,
  builtinOperatorDeclarations,
  builtinOperatorDefinitions,
};

// 包含运算符的作用域
export const operatorRawScope = makeRawScope(
  builtinOperatorDeclarations,
  builtinOperatorDefinitions,
);
export const operatorScope = makeScope(operatorRawScope);
export const operatorScopeDocumentation = builtinOperatorDocumentations;

// 包含非运算符函数的作用域
export const functionRawScope = makeRawScope(
  builtinFunctionDeclarations,
  builtinFunctionDefinitions,
);
export const functionScope = makeScope(functionRawScope);
export const fnuctionScopeDocumentation = builtinFunctionDocumentations;
