import type { Scope } from "@dicexp/runtime/scopes";
import { asScope } from "@dicexp/naive-evaluator/internal";

import { functionScope, operatorScope } from "../internal";

import { version } from "../package.json";

const standardScopes: Record<string, Scope> = {
  "barebones": operatorScope,
  "standard": asScope([operatorScope, functionScope]),
};
export default standardScopes;

export const scopesInfo = {
  version,
};
