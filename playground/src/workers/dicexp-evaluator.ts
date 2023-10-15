import { startWorkerServer } from "@dicexp/evaluating-worker-manager/internal";

import dicexp from "dicexp/essence/for-worker";
import standardScopes from "@dicexp/builtins/essence/standard-scopes";

// // 测试 essences 用版本：
// import dicexp from "dicexp/essence/for-worker?url";
// import standardScopes from "@dicexp/builtins/essence/standard-scopes?url";

startWorkerServer(dicexp, standardScopes);
