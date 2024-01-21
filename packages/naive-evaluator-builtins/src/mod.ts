import { Unreachable } from "@dicexp/errors";

import {
  RegularFunctionDocumentation,
  ScopeDocumentation,
} from "@dicexp/interface";

import { asScope, makeRawScope, makeScope } from "@dicexp/runtime/scopes";
import {
  DeclarationListToDocumentationMap,
  Documentation as RegularFunctionRawDocumentation,
  RegularFunctionDeclaration,
} from "@dicexp/runtime/regular-functions";

import { ScopeExplicit } from "./types";

import { builtinOperatorDeclarations as operatorDeclarations } from "./base/operators/declarations";
import { builtinOperatorDefinitions as operatorDefinitions } from "./base/operators/definitions";
import { builtinOperatorDocumentations as operatorDocumentations } from "./base/operators/documentations";
import { builtinFunctionDeclarations as functionDeclarations } from "./base/functions/declarations";
import { builtinFunctionDefinitions as functionDefinitions } from "./base/functions/definitions";
import { builtinFunctionDocumentations as functionDocumentations } from "./base/functions/documentations";

/// 包含运算符的作用域
export const operatorScope = makeScope(
  makeRawScope(operatorDeclarations, operatorDefinitions),
) as ScopeExplicit<
  typeof operatorDefinitions
>;
export const operatorScopeDocumentation = makeScopeDocumentation(
  operatorDeclarations,
  operatorDocumentations,
);

/// 包含非运算符函数的作用域
export const functionScope = makeScope(
  makeRawScope(functionDeclarations, functionDefinitions),
) as ScopeExplicit<
  typeof functionDefinitions
>;
export const functionScopeDocumentation = makeScopeDocumentation(
  functionDeclarations,
  functionDocumentations,
);

export const builtinScope = asScope([operatorScope, functionScope]);
export const builtinScopeDocumentation = mergeScopeDocumentations([
  operatorScopeDocumentation,
  functionScopeDocumentation,
]);

/**
 * TODO: 移到更合适的地方去。
 */
function makeScopeDocumentation<
  T extends readonly RegularFunctionDeclaration[],
>(decls: T, docs: DeclarationListToDocumentationMap<T>): ScopeDocumentation {
  return {
    functions: decls.map((decl): RegularFunctionDocumentation => {
      const fullName = `${decl.name}/${decl.parameters.length}`;
      // @ts-ignore
      const doc: RegularFunctionRawDocumentation = docs[fullName];
      return {
        name: decl.name,
        ...(decl.aliases?.length ? { aliases: decl.aliases } : {}),
        ...(doc.isOperator ? { isOperator: true } : {}),
        groups: doc.groups,
        parameters: decl.parameters.map((p) => {
          // @ts-ignore
          const pDoc: string = doc.parameters[p.label];
          return {
            label: p.label,
            type: p.type,
            description: pDoc,
          };
        }),
        returnValue: {
          type: (() => {
            if (typeof decl.returnValue.type === "object") {
              if (!("returnValue" in doc)) throw new Unreachable();
              return {
                ...decl.returnValue.type,
                description: doc.returnValue.type.description,
              };
            } else {
              return decl.returnValue.type;
            }
          })(),
        },
        description: doc.description,
        ...(doc.examples ? { examples: doc.examples } : {}),
      };
    }),
  };
}

/**
 * TODO: 移到更合适的地方去。
 */
function mergeScopeDocumentations(
  docs: ScopeDocumentation[],
): ScopeDocumentation {
  return {
    functions: docs.flatMap((doc) => doc.functions),
  };
}
