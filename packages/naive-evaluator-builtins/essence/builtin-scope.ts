import { asScope } from "@dicexp/naive-evaluator/internal";

import { functionScope, operatorScope } from "../internal";

import { version } from "../package.json";

const builtinScope = asScope([operatorScope, functionScope]);
export default builtinScope;

export const scopeInfo = {
  version,
};
