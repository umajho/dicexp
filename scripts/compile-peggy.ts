#!/usr/bin/env -S deno run --allow-all

import { writeAll } from "https://deno.land/std@0.178.0/streams/mod.ts";

import { default as peggy } from "npm:peggy@3.0.1";

if (Deno.args.length !== 1) {
  throw new Error("Bad args!");
}

const sourcePath = Deno.args[0];
const source = await Deno.readTextFile(sourcePath);

const options: peggy.SourceBuildOptions<"source-with-inline-map"> = {
  format: "es",
  grammarSource: sourcePath,
  output: "source-with-inline-map",
};

const output = peggy.generate(source, options);

await writeAll(Deno.stdout, new TextEncoder().encode(output));
