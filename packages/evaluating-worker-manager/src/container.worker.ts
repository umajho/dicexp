import { startWorkerServer } from "./worker-inner/mod";

onmessage = (ev) => {
  const [dicexp, standardScopes]: [string, string] = ev.data;
  onmessage = null;
  startWorkerServer(dicexp, standardScopes);
};
