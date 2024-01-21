import { IconTypes } from "solid-icons";
import { VsSymbolMethod, VsSymbolOperator } from "solid-icons/vs";

import {
  RegularFunctionDocumentation,
  ScopeDocumentation,
} from "@dicexp/interface";

import * as builtins from "@dicexp/naive-evaluator-builtins/internal";

export interface ScopeInfo {
  displayName: string;
  icon?: IconTypes;
  documentation: ScopeDocumentation;
}

/**
 * TODO: 应该只使用 `builtins.builtinScopeDocumentation`，然后用 `isOperator` 来
 * 区分是否为运算符。
 *
 * TODO: 也许应该改成一个类，让 `totalRegularFunctions` 也成为这个类的成员函数？
 */
export const scopes: ScopeInfo[] = [
  {
    displayName: "全部",
    documentation: builtins.builtinScopeDocumentation,
  },
  {
    displayName: "运算符",
    icon: VsSymbolOperator,
    documentation: builtins.operatorScopeDocumentation,
  },
  {
    displayName: "函数",
    icon: VsSymbolMethod,
    documentation: builtins.functionScopeDocumentation,
  },
];
export const totalRegularFunctions =
  builtins.builtinScopeDocumentation.functions.length;

export function getFunctionFullName(doc: RegularFunctionDocumentation) {
  return `${doc.name}/${doc.parameters.length}`;
}
