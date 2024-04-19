# naive-evaluator-in-worker

## Usage

`evaluating.worker.ts`:

```typescript
import { startWorkerServer } from "@dicexp/naive-evaluator-in-worker";

import { asScope, Evaluator } from "@dicexp/naive-evaluator";
import { functionScope, operatorScope } from "@dicexp/naive-evaluator-builtins";

// 将 “运算符作用域” 与 “函数作用域” 合并为一个作用域
const topLevelScope = asScope([operatorScope, functionScope]);

startWorkerServer((opts) => (new Evaluator(opts)), topLevelScope);
```

`main.ts`:

```typescript
import { EvaluatingWorkerManager } from "@dicexp/naive-evaluator-in-worker";

// 假设在用 Vite，总之 `DicexpEvaluatingWorker` 的类型是 `new () => Worker`
import DicexpEvaluatingWorker from "./evaluating.worker?worker";
import type { Scopes } from "./evaluating.worker";

let manager: EvaluatingWorkerManager<Scopes> | undefined;

async function roll() {
  // `result` 的类型是 `EvaluationResult`。
  // “dicexp” 包的 README 中有列举 `EvaluationResult` 需要处理的分支。
  const result = await manager!.evaluate("d100", {
    execution: { topLevelScope: "standard" },
  });
  console.log(result);
}

manager = new EvaluatingWorkerManager(
  () => new DicexpEvaluatingWorker(),
  (ready) => ready && roll(),
);
```
