import { execute } from "./internal/executing/execute.ts";
import { RuntimeError } from "./internal/executing/runtime_errors.ts";
import { parse } from "./internal/parsing/parser.js";

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
      console.log(Deno.inspect(parsed, { depth: Infinity }));
      continue;
    }

    const { value: finalValue, runtimeError: err } = execute(parsed);
    if (err instanceof RuntimeError) {
      console.log(`runtime error:`, err);
    } else {
      console.log(
        `%c=> ${Deno.inspect(finalValue, { depth: Infinity })}`,
        "color: green",
      );
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error("non-runtime error:", e);
    } else {
      console.error("unknown error:", e);
    }
  }
}
