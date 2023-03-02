import { execute } from "./internal/executing/execute.ts";
import { RuntimeError } from "./internal/executing/runtime_errors.ts";
import { parse } from "./internal/parsing/parse.ts";

while (1) {
  let code = prompt(">");
  if (!code) continue;

  let parseOnly = false;
  if (/^p\s/.test(code)) {
    code = code.slice(1);
    parseOnly = true;
  }

  try {
    const parsed = parse(code);
    if (parseOnly) {
      console.log(Deno.inspect(parsed));
      continue;
    }

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
