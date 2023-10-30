import { IconTypes } from "solid-icons";
import { VsSymbolMethod, VsSymbolOperator } from "solid-icons/vs";

import {
  DeclarationListToDocumentationMap,
  RegularFunctionDeclaration,
} from "@dicexp/runtime/regular-functions";
import { asScope, Scope } from "@dicexp/runtime/scopes";

import * as builtins from "@dicexp/builtins/internal";

export interface ScopeInfo {
  displayName: string;
  icon?: IconTypes;
  declarations: readonly RegularFunctionDeclaration[];
  documentations: DeclarationListToDocumentationMap<any>;
}

export const scopes: ScopeInfo[] = [
  {
    displayName: "运算符",
    icon: VsSymbolOperator,
    declarations: builtins.operatorDeclarations,
    documentations: builtins.operatorDocumentations,
  },
  {
    displayName: "函数",
    icon: VsSymbolMethod,
    declarations: builtins.functiondDeclarations,
    documentations: builtins.functionDocumentations,
  },
];

// FIXME: 应该和 `@dicexp/runtime` 中 makeScope 函数中的步骤统一为一个函数
export function getFunctionFullName(decl: RegularFunctionDeclaration) {
  return `${decl.name}/${decl.parameters.length}`;
}

export const scopesForRuntime = {
  "barebones": builtins.operatorScope,
  "standard": asScope([builtins.operatorScope, builtins.functionScope]),
} as const satisfies Record<string, Scope>;
