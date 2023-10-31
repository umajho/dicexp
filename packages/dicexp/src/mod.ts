export * from "@dicexp/parsing-into-node-tree";
export * from "@dicexp/node-tree-walk-interpreter";
export * from "./evaluating/mod";

import { name, version } from "../package.json";

export const evaluatorInfo = {
  nameWithoutVersion: name,
  version,
  get nameWithVersion() {
    return `${evaluatorInfo.nameWithoutVersion}@${evaluatorInfo.version}`;
  },
};
