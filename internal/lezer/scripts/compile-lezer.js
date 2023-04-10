import { buildParserFile } from "@lezer/generator";
import { promises as fs } from "fs";

async function main(args) {
  if (args.length !== 1) {
    throw new Error("Bad args!");
  }

  const sourcePath = args[0];
  const basePath = /^(.*)\.grammar$/.exec(sourcePath)[1];
  const outPath = basePath + ".grammar.js";
  const outTermPath = basePath + ".grammar.term.js";

  const source = await fs.readFile(sourcePath, { encoding: "utf-8" });

  const { parser: parserCode, terms: termCode } = buildParserFile(source, {
    fileName: sourcePath,
    moduleStyle: "es",
    warn: (msg) => console.warn(msg),
  });

  await fs.writeFile(outPath, parserCode, { encoding: "utf-8" });
  await fs.writeFile(outTermPath, termCode, { encoding: "utf-8" });
}

await main(process.argv.slice(2));
