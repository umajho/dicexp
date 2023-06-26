import type { RegularFunctionDeclaration } from "./decl";

/**
 * 根据声明得到函数的完整名称。（即包含 arity 的名称。）
 */
export type FullName<T extends RegularFunctionDeclaration> =
  `${T["name"]}/${T["parameters"]["length"]}`;
