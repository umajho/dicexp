import {
  LazyValue,
  RuntimeProxyForFunction,
  RuntimeResult,
  Value_Callable,
  Value_Integer$SumExtendable,
  Value_List$Extendable,
  ValueTypeName,
} from "../../values/mod";
import {
  DeclarationParameter,
  DeclarationReturnValueTypeSpec,
  RegularFunctionDeclaration,
} from "./decl";
import { FullName } from "./utils";

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
  rtm: RuntimeProxyForFunction,
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
export type ParameterListToTuple<T extends readonly DeclarationParameter[]> = {
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
