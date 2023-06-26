import type { ValueTypeName } from "../../values/mod";
import {
  DeclarationParameter,
  DeclarationReturnValue,
  RegularFunctionDeclaration,
} from "./decl";
import type { FullName } from "./utils";

/**
 * 将通常函数声明列表的常量类型转换成通常函数文档 Map 的类型。
 *
 * 转换后的类型可以在定义各对应函数文档时作为类型提示。
 */
export type DeclarationListToDocumentationMap<DeclList extends readonly any[]> =
  DeclList extends
    readonly [infer Head extends RegularFunctionDeclaration, ...infer Tail] ?
      & { [name in FullName<Head>]: DeclarationToDocumentation<Head> }
      & DeclarationListToDocumentationMap<Tail>
    : {};

type DeclarationToDocumentation<Decl extends RegularFunctionDeclaration> = {
  /**
   * 是否是运算符。
   */
  isOperator?: true;
  /**
   * 参数列表的文档。
   */
  parameters: ParameterListToLabelDocumentationMap<Decl["parameters"]>;
  /**
   * 描述。
   */
  description: string;
} & ReturnValueToMapWithReturnValueDocumentation<Decl["returnValue"]>;

type ParameterListToLabelDocumentationMap<
  ParamList extends readonly any[],
> = ParamList extends
  readonly [infer Head extends DeclarationParameter, ...infer Tail] ?
    & {
      [label in Head["label"]]: string;
    }
    & ParameterListToLabelDocumentationMap<Tail>
  : {};

// type ParameterListToParameterDocumentationList<
//   ParamList extends readonly any[],
// > = ParamList extends
//   readonly [infer Head extends DeclarationParameter, ...infer Tail] ? [
//     ParameterToParameterDocumentation<Head>,
//     ...ParameterListToParameterDocumentationList<Tail>,
//   ]
//   : [];

// type ParameterToParameterDocumentation<Param extends DeclarationParameter> = {
//   /**
//    * 标签。
//    */
//   label: Param["label"];
//   /**
//    * 描述，用于文档。
//    */
//   description: string;
// };

type ReturnValueToMapWithReturnValueDocumentation<
  ReturnValue extends DeclarationReturnValue,
> = ReturnValue["type"] extends ValueTypeName ? {}
  : { returnValue: { type: { description: string } } };
