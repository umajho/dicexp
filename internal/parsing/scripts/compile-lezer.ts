#!/usr/bin/env -S deno run --allow-all

import { buildParserFile } from "npm:@lezer/generator@1.2.2";

async function main() {
  if (Deno.args.length !== 1) {
    throw new Error("Bad args!");
  }

  const sourcePath = Deno.args[0];
  const basePath = /^(.*)\.grammar$/.exec(sourcePath)![1];
  const outPath = basePath + ".grammar.js";
  const outTermPath = basePath + ".grammar.term.js";

  const source = await Deno.readTextFile(sourcePath);

  const { parser: parserCode, terms: termCode } = buildParserFile(source, {
    fileName: sourcePath,
    moduleStyle: "es",
    warn: (msg) => console.warn(msg),
  });

  await Deno.writeTextFile(outPath, parserCode);
  await Deno.writeTextFile(outTermPath, termCode);
}

if (import.meta.main) {
  await main();
}
