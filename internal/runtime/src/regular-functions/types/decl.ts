import { ValueTypeName } from "../../values/mod";

/**
 * 通常函数声明。
 */
export interface RegularFunctionDeclaration {
  /**
   * 名称。（调用时使用。）
   */
  name: string;
  /**
   * 别称，可以代替名称使用。
   */
  aliases?: readonly string[];
  /**
   * 参数列表的声明。
   */
  parameters: readonly DeclarationParameter[];
  /**
   * 返回值的声明。
   */
  returnValue: DeclarationReturnValue;
}

/**
 * 通常函数的参数列表声明。
 */
export interface DeclarationParameter {
  /**
   * 标签，便于与文档对照，无实际功能。
   */
  label: string;
  /**
   * 接受的类型。
   */
  type: DeclarationParameterTypeSpec;
}

/**
 * 通常函数参数的类型规格。
 *
 * - "$lazy": 直接传入 ValueBox，不要求其值。
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
export interface DeclarationReturnValue {
  type: DeclarationReturnValueTypeSpec;
}

/**
 * 通常函数返回值的类型规格。
 *
 * - ValueTypeName: 指定单一类型。
 * - { dynamic: true, ... }: 根据情况动态改变。
 */
export type DeclarationReturnValueTypeSpec =
  | ValueTypeName
  | { dynamic: true; lazy?: true };
