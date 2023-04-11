import type { Node } from "@dicexp/nodes";

import type { LazyValue, RuntimeResult, Value_List } from "./values";

export type Scope = { [ident: string]: RegularFunction | LazyValue };

export type RegularFunction = (
  args: Value_List,
  rtm: RuntimeProxyForFunction,
) => RuntimeResult<LazyValue>;

export interface RuntimeProxyForFunction {
  interpret: (scope: Scope, node: Node) => LazyValue;
  random: RandomGenerator;
}

export interface RandomGenerator {
  integer(lower: number, upper: number): number;
}
