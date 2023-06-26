import type { Node } from "@dicexp/nodes";

import type { Concrete, LazyValue, RuntimeResult, Value_List } from "./values";
import type {
  DeclarationListToDefinitionMap,
  RegularFunctionDeclaration,
} from "../regular-functions/mod";

export type Scope = { [ident: string]: RegularFunction | LazyValue };

export type RawScope = {
  isRawScope: true;
  declarations: readonly RegularFunctionDeclaration[];
  definitions: Record<string, Function>;
};

export function makeRawScope<T extends readonly RegularFunctionDeclaration[]>(
  declarations: T,
  definitions: DeclarationListToDefinitionMap<T>,
): RawScope {
  return { isRawScope: true, declarations, definitions };
}

export type RegularFunction = (
  args: Value_List,
  rtm: RuntimeProxyForFunction,
) => RuntimeResult<LazyValue>;

export interface RuntimeProxyForFunction {
  interpret: (scope: Scope, node: Node) => LazyValue;
  random: RandomGenerator;
  concretize(v: LazyValue, rtm: RuntimeProxyForFunction | null): Concrete;
}

export interface RandomGenerator {
  integer(lower: number, upper: number): number;
}
