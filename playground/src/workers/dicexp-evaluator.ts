import { startWorkerServer } from "@dicexp/evaluating-worker-manager/internal";

// @ts-ignore 似乎 tsc / package.json 中的 exports 字段 / pnpm workspace 之间不对付
import dicexp from "@dicexp/essences-for-worker/internal/dicexp";
// @ts-ignore 同上
import standardScopes from "@dicexp/essences-for-worker/internal/standard-scopes";

// // 测试 essences 用版本：
// import dicexp from "dicexp/essence/for-worker?url";
// import standardScopes from "@dicexp/builtins/essence/standard-scopes?url";

startWorkerServer(dicexp, standardScopes);
