import { execute } from "./internal/executing/execute.ts";
import { RuntimeError } from "./internal/executing/runtime_errors.ts";
import { parse } from "./internal/parsing/parse.ts";

while (1) {
  const code = prompt(">");
  if (!code) continue;
  try {
    const parsed = parse(code);
    const result = execute(parsed);
    if (result instanceof RuntimeError) {
      console.log(`runtime error:`, result);
    } else {
      console.log(`%c=> ${Deno.inspect(result)}`, "color: green");
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error("non-runtime error:", e);
    } else {
      console.error("unknown error:", e);
    }
  }
}
