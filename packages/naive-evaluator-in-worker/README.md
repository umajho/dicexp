# naive-evaluator-in-worker

## Usage

`evaluating.worker.ts`:

```typescript
import { asScope, evaluate, execute, parse } from "@dicexp/naive-evaluator";
import { functionScope, operatorScope } from "@dicexp/naive-evaluator-builtins";
import { startWorkerServer } from "@dicexp/naive-evaluator-in-worker/internal";

const scopes = {
  "standard": asScope([operatorScope, functionScope]),
};

export type Scopes = typeof scopes;

const dicexp = { parse, execute, evaluate };
startWorkerServer(dicexp, scopes);
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
