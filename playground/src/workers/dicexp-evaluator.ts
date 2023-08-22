import { startWorkerServer } from "dicexp";

import { scopesForRuntime } from "../stores/scopes";

startWorkerServer(scopesForRuntime);
