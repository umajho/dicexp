import { Unreachable } from "@dicexp/errors";
import { asScope, Scope } from "@dicexp/runtime/scopes";

import * as builtins from "@dicexp/builtins/internal";

export const testScope = ((): Scope => {
  const pickedFunctions: string[] = [
    ...["count/2", "sum/1", "sort/1", "append/2", "at/2"],
    ...["map/2", "filter/2", "head/1", "tail/1", "zip/2", "zipWith/3"],
  ];
  const pickedScope: Scope = {};
  for (const picked of pickedFunctions) {
    if (!builtins.functionScope[picked]) {
      throw new Unreachable(
        `"测试用的函数 \`${picked}\` 不存在于标准作用域中"`,
      );
    }
    pickedScope[picked] = builtins.functionScope[picked];
  }
  return asScope([builtins.operatorScope, pickedScope]);
})();
