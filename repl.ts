import { execute } from "./internal/executing/execute.ts";
import { parse } from "./internal/parsing/parse.ts";

while (1) {
  const code = prompt(">");
  if (!code) continue;
  try {
    const parsed = parse(code);
    const result = execute(parsed);
    console.log(`%c=> ${Deno.inspect(result)}`, "color: green");
  } catch (e) {
    console.error(e);
  }
}
