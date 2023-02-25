#!/usr/bin/env -S deno run

import { readLines } from "https://deno.land/std@0.178.0/io/read_lines.ts";

const lines = await (async () => {
  const lines = [];
  for await (const l of readLines(Deno.stdin)) {
    lines.push(l);
  }
  return lines;
})();

console.log(JSON.stringify(lines.join("\n")));
