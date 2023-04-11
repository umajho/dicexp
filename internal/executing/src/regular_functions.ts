import type { RuntimeProxy } from "./runtime";
import type {
  LazyValue,
  RuntimeResult,
  Value_Callable,
  Value_Integer$SumExtendable,
  Value_List$Extendable,
} from "@dicexp/runtime-values";
import type { ValueTypeName } from "./values_impl";

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
type DeclarationParameterTypeSpec =
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
type DeclarationReturnValueTypeSpec =
  | ValueTypeName
  | { dynamic: true; description: string; lazy?: true };

/**
 * 将通常函数声明列表的常量类型转换成通常函数定义 Map 的类型。
 *
 * 转换后的类型可以在定义各对应函数实现时作为类型提示。
 */
export type DeclarationListToDefinitionMap<DeclList extends readonly any[]> =
  DeclList extends
    readonly [infer Head extends RegularFunctionDeclaration, ...infer Tail] ? 
      & { [name in FullName<Head>]: DeclarationToFunction<Head> }
      & DeclarationListToDefinitionMap<Tail>
    : {};

/**
 * 根据声明得到函数的完整名称。（即包含 arity 的名称。）
 */
type FullName<T extends RegularFunctionDeclaration> =
  `${T["name"]}/${T["parameters"]["length"]}`;

/**
 * 把声明转换成定义时对应的实现的函数类型。
 */
type DeclarationToFunction<Decl extends RegularFunctionDeclaration> =
  ParameterListToFunction<Decl["parameters"], Decl["returnValue"]["type"]>;

/**
 * 根据声明中的参数列表与返回值类型，得到定义时对应的实现的函数类型。
 */
type ParameterListToFunction<
  ParamList extends readonly DeclarationParameter[],
  ReturnValueType extends DeclarationReturnValueTypeSpec,
> = (
  rtm: RuntimeProxy,
  ...args: ParameterListToTuple<ParamList>
) => RuntimeResult<
  ReturnValueType extends { lazy: true } ? { lazy: LazyValue }
    : { value: ReturnValueTypeSpecToType<ReturnValueType> }
>;

/**
 * 把声明中的参数列表转换成一一对应的类型元组。
 *
 * 例：
 *
 * `[{type: "string", ...}, {type: "integer", ...}]` -> `[string, number]`。
 */
type ParameterListToTuple<T extends readonly DeclarationParameter[]> = {
  [P in keyof T]: ParameterTypeSpecToType<T[P]["type"]>;
};

/**
 * 参数会使用的字符串常量到类型的映射，与 `DeclarationParameterTypeSpec` 对应。
 */
type ParameterTypeSpecMap =
  & BasicTypeSpecToTypeMap
  & LazyTypeSpecMap
  & AnyTypeSpecMap;
/**
 * 将参数的类型规格转换成对应的类型。
 */
type ParameterTypeSpecToType<T> = T extends keyof ParameterTypeSpecMap
  ? ParameterTypeSpecMap[T]
  : (T extends Set<infer T extends ValueTypeName> ? BasicTypeSpecToTypeMap[T]
    : never);

/**
 * 将返回值的类型规格转换成对应的类型。
 */
type ReturnValueTypeSpecToType<T> = T extends keyof BasicTypeSpecToTypeMap
  ? BasicTypeSpecToTypeMap[T]
  : (T extends { dynamic: true } ? AnyType
    : never);

/**
 * 基础类型的映射，对应 `ValueTypeName`。
 */
type BasicTypeSpecToTypeMap = {
  integer: number;
  boolean: boolean;
  list: LazyValue[];
  callable: Value_Callable;
  list$extendable: Value_List$Extendable;
  integer$sum_extendable: Value_Integer$SumExtendable;
};

/**
 * 惰性类型的映射。（对于参数而已，是未经过 concretize；更进一步对于返回值而言，是不求参数的值。）
 */
type LazyTypeSpecMap = {
  $lazy: LazyValue;
};

/**
 * 任意基础类型。
 */
type AnyType = BasicTypeSpecToTypeMap[keyof BasicTypeSpecToTypeMap];

/**
 * 任意基础类型的映射。
 */
type AnyTypeSpecMap = {
  "*": AnyType;
};
