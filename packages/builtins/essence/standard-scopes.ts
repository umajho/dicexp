import type { Scope } from "@dicexp/runtime/values";
import { asScope } from "dicexp/internal";
import { functionScope, operatorScope } from "../internal";

const standardScopes: Record<string, Scope> = {
  "barebones": operatorScope,
  "standard": asScope([operatorScope, functionScope]),
};
export default standardScopes;
