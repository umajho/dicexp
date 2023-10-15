import * as path from "node:path";
import * as fs from "node:fs/promises";

import { defineConfig, Options } from "tsup";

import oldPackageJSON from "./package.json";

function resolvePathSafe(base: string, target: string): string {
  const outDir = path.resolve(base, target);
  if (!outDir.startsWith(path.resolve(base))) {
    throw new Error(`outDir is outside of \`${base}\``);
  }
  return outDir;
}

function getRelativeOutDir(distPath: string, name?: string) {
  const absPath = resolvePathSafe(distPath, name ? path.dirname(name) : ".");
  return path.relative(__dirname, absPath);
}

export default defineConfig(async (_config) => {
  const entries = [
    { entry: "lib.ts" },
    {
      entry: "essence/standard-scopes.ts",
      name: "essence/standard-scopes",
    },
  ];

  const newPackageJSON: any = structuredClone(oldPackageJSON);
  newPackageJSON.exports = {
    ...(Object.fromEntries(entries.map(({ entry, name }) => [
      name ? "./" + name : ".",
      {
        "import": {
          "types": "./" + path.join(
            getRelativeOutDir("dist", name),
            path.parse(entry).name + ".d.ts",
          ),
          "default": "./" + path.join(
            getRelativeOutDir("dist", name),
            path.parse(entry).name + ".js",
          ),
        },
      },
    ]))),
    "./internal": "./internal.ts",
  };

  const newPackageJSONText = JSON.stringify(newPackageJSON, null, 2);
  console.log(
    `package.json: \n\n${newPackageJSONText}\n\n`,
  );

  console.info("Overwriting package.json…");
  await fs.writeFile("package.json", newPackageJSONText);

  return entries.map(({ entry, name }): Options => {
    const outDir = getRelativeOutDir("dist", name);

    return {
      entry: [entry],
      outDir,
      ...(name ? { name } : {}),
      format: "esm",
      dts: true,
      minify: "terser",
      clean: true,
    };
  });
});
