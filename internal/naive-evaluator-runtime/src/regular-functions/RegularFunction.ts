import { ValueBox } from "../value-boxes/mod";

import { RuntimeProxyForFunction } from "./runtime-proxy";

export type RegularFunction = (
  args: ValueBox[],
  rtm: RuntimeProxyForFunction,
) => ValueBox;
