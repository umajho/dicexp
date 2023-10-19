import { startWorkerServer } from "@dicexp/evaluating-worker-manager/internal";

import { essenceForWorker as dicexp } from "dicexp/internal";
import { essenceOfStandardScopes as standardScopes } from "@dicexp/builtins/internal";

// // 测试 essences 用版本：
// import dicexp from "dicexp/essence/for-worker?url";
// import standardScopes from "@dicexp/builtins/essence/standard-scopes?url";

startWorkerServer(dicexp, standardScopes);
