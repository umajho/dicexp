import { Value, ValueBox } from "./values";
import {
  DeclarationListToDefinitionMap,
  RegularFunctionDeclaration,
} from "../regular-functions/mod";
import { RuntimeError } from "./runtime_errors";

export type Scope = {
  [ident: string]: RegularFunction | RegularFunctionAlias | ValueBox;
};

export type RawFunction = (
  rtm: RuntimeProxyForFunction,
  ...args: (Value | ValueBox)[]
) =>
  | ["ok", Value]
  | ["lazy", ValueBox]
  | ["error", RuntimeError | string]
  | ["error_indirect", RuntimeError];
// | ["error_from_argument", RuntimeError | string];

export type RawScope = {
  isRawScope: true;
  declarations: readonly RegularFunctionDeclaration[];
  definitions: Record<string, RawFunction>;
};

export function makeRawScope<T extends readonly RegularFunctionDeclaration[]>(
  declarations: T,
  definitions: DeclarationListToDefinitionMap<T>,
): RawScope {
  return { isRawScope: true, declarations, definitions };
}

export type RegularFunction = (
  args: ValueBox[],
  rtm: RuntimeProxyForFunction,
) => ValueBox;

export interface RuntimeProxyForFunction {
  random: RandomGenerator;
}

export class RegularFunctionAlias {
  constructor(public to: string) {}
}

export interface RandomGenerator {
  integer(lower: number, upper: number): number;
}
