import { describe } from "vitest";

import { theyAreOk } from "@dicexp/test-utils-for-executing";

import { scopeWith } from "./utils";

import { functionScope, operatorScope } from "../lib";

describe("base.functions", () => {
  describe("count/2", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["count/2"]),
      ...scopeWith(operatorScope, [">=/2"]),
    };
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`count([], \(_ -> true))`, 0],
        [String.raw`count([1, 2, 3], \($x -> $x >= 2))`, 2],
      ], { topLevelScope });
    });
  });
});
