import * as path from "node:path";

import { Options as TSUPOptions } from "tsup";

import esbuildPluginInlineWorkerViteStyle from "./esbuild-plugin-inline-worker-vite-style";
import { getRelativeOutDir } from "./utils";

export interface Entry {
  entry: string;
  name?: string;
}
export type MainEntry = Omit<Entry, "name">;
export type OtherEntry = Entry & Required<Pick<Entry, "name">>;

export interface CommonOptions {
  mainEntry: MainEntry;
  otherEntries?: OtherEntry[];
}

export interface GeneratePackageJSONOptions extends CommonOptions {
  withInternalEntry: boolean;
}

export function generatePackageJSON(
  oldPackageJSON: any,
  opts: GeneratePackageJSONOptions,
) {
  const entries: Entry[] = [opts.mainEntry, ...(opts.otherEntries ?? [])];

  const newPackageJSON: any = structuredClone(oldPackageJSON);
  newPackageJSON.exports = {
    ...(Object.fromEntries(entries.map((e) => [
      e.name ? "./" + e.name : ".",
      {
        "import": {
          "types": "./" + path.join(
            getRelativeOutDir("dist", e.name),
            path.parse(e.entry).name + ".d.ts",
          ),
          "default": "./" + path.join(
            getRelativeOutDir("dist", e.name),
            path.parse(e.entry).name + ".js",
          ),
        },
      },
    ]))),
    ...(opts.withInternalEntry ? { "./internal": "./internal.ts" } : {}),
  };
  delete newPackageJSON.main;
  newPackageJSON.types = newPackageJSON.exports["."].import.types;
  newPackageJSON.module = newPackageJSON.exports["."].import.default;

  return newPackageJSON;
}

export interface GenerateTSUPOptionsOptions extends CommonOptions {
  external?: TSUPOptions["external"];
}

export function generateTSUPOptions(opts: GenerateTSUPOptionsOptions) {
  const entries: Entry[] = [opts.mainEntry, ...(opts.otherEntries ?? [])];

  return entries.map(({ entry, name }): TSUPOptions => {
    const outDir = getRelativeOutDir("dist", name);

    return {
      entry: [entry],
      outDir,
      ...(name ? { name } : {}),
      target: "es2020",
      format: "esm",
      dts: true,
      ...(opts.external ? { external: opts.external } : {}),
      minify: "terser",
      clean: true,
      esbuildPlugins: [esbuildPluginInlineWorkerViteStyle()],
    };
  });
}
