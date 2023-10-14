import { asScope } from "dicexp/internal";
import { functionScope, operatorScope } from "@dicexp/builtins/internal";

const standardScopes = {
  "barebones": operatorScope,
  "standard": asScope([operatorScope, functionScope]),
};
export default standardScopes;
