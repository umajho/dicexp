import type { ValueTypeName } from "../../values/mod";

/**
 * 通常函数声明。
 */
export interface RegularFunctionDeclaration {
  /**
   * 名称。（调用时使用。）
   */
  name: string;
  /**
   * 是否是运算符。
   */
  isOperator?: true;
  /**
   * 参数列表的声明。
   */
  parameters: readonly DeclarationParameter[];
  /**
   * 返回值的声明。
   */
  returnValue: DeclarationReturnValue;
  /**
   * 描述，用于文档。
   */
  description: string;
}

/**
 * 通常函数的参数列表声明。
 */
interface DeclarationParameter {
  /**
   * 标签，用于文档。
   */
  label: string;
  /**
   * 接受的类型。
   */
  type: DeclarationParameterTypeSpec;
  /**
   * 描述，用于文档。
   */
  description: string;
}

/**
 * 通常函数参数的类型规格。
 *
 * - "$lazy": 传入原始的 LazyValue，不要 concretize。（其他都会 concretize。）
 * - ValueTypeName: 指定单一类型。
 * - readonly ValueTypeName[]: 指定几个可选类型，满足其一即可。
 * - "*": 任何类型都可以。
 */
export type DeclarationParameterTypeSpec =
  | "$lazy"
  | ValueTypeName
  | Set<ValueTypeName>
  | "*";

/**
 * 通常函数返回值的声明。
 */
interface DeclarationReturnValue {
  type: DeclarationReturnValueTypeSpec;
}

/**
 * 通常函数返回值的类型规格。
 *
 * - ValueTypeName: 指定单一类型。
 * - ~~{ dynamic: string }: 根据情况动态改变，其中的 `dynamic` 用于文档。~~
 */
export type DeclarationReturnValueTypeSpec =
  | ValueTypeName
  | { dynamic: true; description: string; lazy?: true };
