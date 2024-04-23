# naive-evaluator-in-worker

## Usage

`evaluating.worker.js`:

```javascript
import { startWorkerServer } from "@dicexp/naive-evaluator-in-worker";

import { asScope, Evaluator } from "@dicexp/naive-evaluator";
import { functionScope, operatorScope } from "@dicexp/naive-evaluator-builtins";

// 将 “运算符作用域” 与 “函数作用域” 合并为一个作用域。
const topLevelScope = asScope([operatorScope, functionScope]);

startWorkerServer((opts) => (new Evaluator(opts)), topLevelScope);
```

`main.js`:

```javascript
import { EvaluatingWorkerManager } from "@dicexp/naive-evaluator-in-worker";

// 如果运行环境是并不存在原生 Web Worker 的 node：
// 可以将 “web-worker” 包添加为依赖。（目前的最新版本 1.3.0 对模块的支持有问题，
// 可以考虑使用更老的 1.2.0。）
import Worker from "web-worker";
const workerProvider = () =>
  new Worker(new URL("./evaluating.worker.js", import.meta.url), {
    type: "module",
  });

// 如果运行环境是浏览器，假设使用 Vite 打包：
import DicexpEvaluatingWorker from "./evaluating.worker?worker";
const workerProvider = () => new DicexpEvaluatingWorker();

const result = await new Promise((resolve) => {
  const manager = new EvaluatingWorkerManager(
    workerProvider,
    async (ready) => {
      if (!ready) return;

      // `result` 的类型是 `EvaluationResult`。
      // “dicexp” 包的 README 中有列举 `EvaluationResult` 需要处理的分支。
      const result = await manager.evaluateRemote("d100", {
        execution: { seed: 42 },
      });

      resolve(result);
      manager.destroy();
    },
    {
      newEvaluatorOptions: {
        randomSourceMaker: "xorshift7",
      },
    },
  );
});

console.log(result);
```
