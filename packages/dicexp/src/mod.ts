export * from "@dicexp/parsing-into-nodes";
export * from "./executing/mod";
export * from "./evaluating/mod";

import { name, version } from "../package.json";

export const evaluatorInfo = {
  nameWithoutVersion: name,
  version,
  get nameWithVersion() {
    return `${evaluatorInfo.nameWithoutVersion}@${evaluatorInfo.version}`;
  },
};
