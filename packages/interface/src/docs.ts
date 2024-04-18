export interface ScopeDocumentation {
  functions: RegularFunctionDocumentation[];
}

export interface RegularFunctionDocumentation {
  /**
   * 名称，不带 arity 部分。
   */
  name: string;
  /**
   * 别称。
   */
  aliases?: readonly string[];
  /**
   * 是否是运算符。
   */
  isOperator?: true;
  /**
   * 所属分组。（仅用于文档。）
   */
  groups: readonly string[];
  /**
   * 参数列表的文档。
   */
  parameters: readonly {
    label: string;
    type: RegularFunctionParameterTypeSpec;
    description: string;
  }[];
  /**
   * 返回值的文档。
   */
  returnValue: {
    type: RegularFunctionReturnValueTypeSpec;
  };
  /**
   * 描述。
   *
   * - `.short`: 简洁的一句话描述。（不含句号）
   * - `.further`：进一步的说明。
   */
  description: {
    brief: string;
    further?: string;
  };
  /**
   * 示例，可以执行的代码。
   */
  examples?: readonly string[];
}

export type ValueType =
  | "integer"
  | "boolean"
  | "list"
  | "callable"
  | "sequence$sum"
  | "sequence";

/**
 * 通常函数参数的类型规格。
 *
 * - "$lazy": 直接传入 ValueBox，不要求其值。
 * - ValueTypeName: 指定单一类型。
 * - readonly ValueTypeName[]: 指定几个可选类型，满足其一即可。
 * - "*": 任何类型都可以。
 */
export type RegularFunctionParameterTypeSpec =
  | "$lazy"
  | ValueType
  | Set<ValueType>
  | "*";

/**
 * 通常函数返回值的类型规格。
 *
 * - ValueTypeName: 指定单一类型。
 * - { dynamic: true, ... }: 根据情况动态改变。
 */
export type RegularFunctionReturnValueTypeSpec =
  | ValueType
  | { dynamic: true; lazy?: true; description: string };
