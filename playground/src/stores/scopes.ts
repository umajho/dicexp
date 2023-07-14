import {
  DeclarationListToDocumentationMap,
  RegularFunctionDeclaration,
} from "@dicexp/runtime/regular-functions";
import * as builtins from "@dicexp/builtins/internal";

export interface ScopeInfo {
  displayName: string;
  declarations: readonly RegularFunctionDeclaration[];
  documentations: DeclarationListToDocumentationMap<any>;
}

export const scopes: ScopeInfo[] = [
  {
    displayName: "运算符",
    declarations: builtins.operatorDeclarations,
    documentations: builtins.operatorDocumentations,
  },
  {
    displayName: "函数",
    declarations: builtins.functiondDeclarations,
    documentations: builtins.functionDocumentations,
  },
];

// FIXME: 应该和 `@dicexp/runtime` 中 makeScope 函数中的步骤统一为一个函数
export function getFunctionFullName(decl: RegularFunctionDeclaration) {
  return `${decl.name}/${decl.parameters.length}`;
}