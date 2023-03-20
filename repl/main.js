import { execute, parse, RuntimeError } from "dicexp";

// import inspect from "browser-util-inspect";
// REPL 不用在非 Node 环境下运行，就直接用了
import { inspect } from "util";

import _prompt from "prompt-sync";
const prompt = _prompt({ sigint: true });

while (1) {
  let code = prompt("> ");
  if (!code) continue;

  let parseOnly = false;
  if (/^p\s/.test(code)) {
    code = code.slice(1);
    parseOnly = true;
  }

  try {
    const parsed = parse(code);
    if (parseOnly) {
      console.log(inspect(parsed, { depth: Infinity }));
      continue;
    }

    const { value: finalValue, runtimeError: err } = execute(parsed);
    if (err instanceof RuntimeError) {
      console.log(`runtime error:`, err);
    } else {
      console.log(
        `%c=> ${inspect(finalValue, { depth: Infinity })}`,
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
