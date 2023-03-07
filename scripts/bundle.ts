#!/usr/bin/env -S deno run --allow-all

import { writeAll } from "https://deno.land/std@0.178.0/streams/mod.ts";

import { build, stop } from "https://deno.land/x/esbuild@v0.17.11/mod.js";
import { httpImports } from "https://deno.land/x/esbuild_plugin_http_imports@v1.2.4/index.ts";

if (Deno.args.length !== 1) {
  throw new Error("Bad args!");
}

const { outputFiles } = await build({
  bundle: true,
  minify: true,
  entryPoints: [Deno.args[0]],
  platform: "browser",
  format: "esm",
  plugins: [
    httpImports({
      // 不然 .mjs 的 loader 会是不存在的 mjs 而非 js
      defaultToJavascriptIfNothingElseFound: true,
    }),
  ],
  write: false,
});

await writeAll(Deno.stdout, outputFiles[0].contents);

stop();
