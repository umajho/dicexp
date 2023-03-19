#!/usr/bin/env -S deno run --allow-all

import { buildParserFile } from "npm:@lezer/generator@1.2.2";

import { parse } from "npm:@babel/parser@7";
// If I use import { generate as default }, generate become an object...
import generator from "npm:@babel/generator@7";

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

  const parsedParserCode = parse(parserCode, { sourceType: "module" });
  const parsedTermCode = parse(termCode, { sourceType: "module" });
  rewriteImportsInPlace(parsedParserCode);
  rewriteImportsInPlace(parsedTermCode);

  const rewrittenParserCode = generator.default(parsedParserCode).code;
  const rewrittenTermCode = generator.default(parsedTermCode).code;

  await Deno.writeTextFile(outPath, rewrittenParserCode);
  await Deno.writeTextFile(outTermPath, rewrittenTermCode);
}

function rewriteImportsInPlace(parsed: ReturnType<typeof parse>) {
  const body = parsed.program.body;

  for (const node of body) {
    if (node.type === "ImportDeclaration") {
      if (/^[a-zA-Z0-9_@]/.test(node.source.value)) {
        node.source.value = "npm:" + node.source.value;
      }
    }
  }
}

if (import.meta.main) {
  await main();
}
