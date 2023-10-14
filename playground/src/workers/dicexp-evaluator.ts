import { startWorkerServer } from "@dicexp/evaluating-worker-manager/internal";

import dicexp from "@dicexp/essences-for-worker/internal/dicexp";
import standardScopes from "@dicexp/essences-for-worker/internal/standard-scopes";

startWorkerServer(dicexp, standardScopes);
