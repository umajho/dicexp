import { asRuntimeError, evaluate, execute, parse } from "dicexp";
import { startWorkerServer } from "@dicexp/evaluating-worker-manager/internal";

import { scopesForRuntime } from "../stores/scopes";

const dicexp = { parse, execute, evaluate, asRuntimeError };
startWorkerServer(dicexp, scopesForRuntime);
