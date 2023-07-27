import { startWorkerServer } from "dicexp/internal";

import { scopesForRuntime } from "../stores/scopes";

startWorkerServer(scopesForRuntime);
