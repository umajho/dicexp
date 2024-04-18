import { startWorkerServer } from "./worker-inner/mod";

onmessage = (ev) => {
  const [dicexp, topLevelScope]: [string, string] = ev.data;
  onmessage = null;
  startWorkerServer(dicexp, topLevelScope);
};
