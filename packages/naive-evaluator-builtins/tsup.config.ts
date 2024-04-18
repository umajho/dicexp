import * as fs from "node:fs/promises";

import { defineConfig } from "tsup";

import {
  CommonOptions,
  generatePackageJSON,
  generateTSUPOptions,
} from "./node_modules/@dicexp/build-utils/lib";

import oldPackageJSON from "./package.json";

export default defineConfig(async (_config) => {
  const opts: CommonOptions = {
    mainEntry: { entry: "lib.ts" },
    otherEntries: [{
      entry: "essence/builtin-scope.ts",
      name: "essence/builtin-scope",
    }],
  };

  const newPackageJSON = generatePackageJSON(oldPackageJSON, {
    ...opts,
    withInternalEntry: true,
  });

  const newPackageJSONText = JSON.stringify(newPackageJSON, null, 2);
  console.log(
    `package.json: \n\n${newPackageJSONText}\n\n`,
  );

  console.info("Overwriting package.json…");
  await fs.writeFile("package.json", newPackageJSONText);

  return generateTSUPOptions(opts);
});
