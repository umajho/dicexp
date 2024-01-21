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
 * 文档参见 `@dicexp/interface` 中 `RegularFunctionParameterTypeSpec` 类型的文
 * 档。
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
 * 文档参见 `@dicexp/interface` 中 `RegularFunctionReturnValueTypeSpec` 类型的文
 * 档。
 */
export type DeclarationReturnValueTypeSpec =
  | ValueTypeName
  | { dynamic: true; lazy?: true };
