import { startWorkerServer } from "@dicexp/naive-evaluator-in-worker/internal";

import { essenceForWorker as dicexp } from "@dicexp/naive-evaluator/internal";
import { essenceOfStandardScopes as standardScopes } from "@dicexp/naive-evaluator-builtins/internal";

// // 测试 essences 用版本：
// import dicexp from "dicexp/essence/for-worker?url";
// import standardScopes from "@dicexp/naive-evaluator-builtins/essence/standard-scopes?url";

startWorkerServer(dicexp, standardScopes);
