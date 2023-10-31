import { buildParserFile } from "@lezer/generator";
import { promises as fs } from "fs";

async function main(args) {
  if (args.length !== 1) {
    throw new Error("Bad args!");
  }

  const sourcePath = args[0];
  const basePath = /^(.*)\.grammar$/.exec(sourcePath)[1];
  const outPath = basePath + ".grammar.ts";
  const outTermPath = basePath + ".grammar.term.ts";

  const source = await fs.readFile(sourcePath, { encoding: "utf-8" });

  let { parser: parserCode, terms: termCode } = buildParserFile(source, {
    fileName: sourcePath,
    moduleStyle: "es",
    typeScript: true,
    warn: (msg) => console.warn(msg),
  });

  parserCode = appendNoCheck(parserCode);
  termCode = appendNoCheck(termCode);

  await fs.writeFile(outPath, parserCode, { encoding: "utf-8" });
  await fs.writeFile(outTermPath, termCode, { encoding: "utf-8" });
}

function appendNoCheck(input) {
  return "// @ts-nocheck\n" + input;
}

await main(process.argv.slice(2));
