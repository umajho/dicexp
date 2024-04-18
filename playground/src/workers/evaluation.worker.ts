import { startWorkerServer } from "@dicexp/naive-evaluator-in-worker/internal";

import { essenceForWorker as evaluatorMaker } from "@dicexp/naive-evaluator/internal";
import { essenceOfBuiltinScope as builtinScope } from "@dicexp/naive-evaluator-builtins/internal";

// // 测试 essences 用版本：
// import dicexp from "dicexp/essence/for-worker?url";
// import builtinScope from "@dicexp/naive-evaluator-builtins/essence/builtin-scope?url";

startWorkerServer(evaluatorMaker, builtinScope);
