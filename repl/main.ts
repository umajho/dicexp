import { execute, parse, RuntimeError } from "dicexp/internal";

// import inspect from "browser-util-inspect";
// REPL 不用在非 Node 环境下运行，就直接用了
import { inspect } from "util";

import _prompt from "prompt-sync";
const prompt = _prompt({ sigint: true });

let seed: number | undefined = undefined;
let allowsSimpleParsing = true;

MAIN_LOOP:
while (1) {
  let code = prompt("> ").trim();
  if (code === "") continue;

  let parseOnly = false;

  if (code.startsWith("/")) {
    const m = code.match(/^\/(\S+)(?:\s+(.*)|\s*)$/);
    if (!m) {
      console.error("无效命令格式！");
      continue;
    }
    const cmd = m[1];
    const rest = m[2] ?? "";

    switch (cmd) {
      case "p":
        parseOnly = true;
        code = rest;
        break;
      case "simple": {
        switch (rest.trim()) {
          case "on":
            allowsSimpleParsing = true;
            break;
          case "off":
            allowsSimpleParsing = false;
            break;
          default:
            console.error("后续必须是 “on” 或者 “off”！");
            continue MAIN_LOOP;
        }
        continue MAIN_LOOP;
      }
      case "seed": {
        const seedText = rest.trim();
        const seedParsed = parseInt(seedText);
        if (!/^\d+$/.test(seedText) || !Number.isInteger(seedParsed)) {
          console.error("seed 必须是整数！");
          continue MAIN_LOOP;
        }
        seed = seedParsed;
        continue MAIN_LOOP;
      }
      case "no_seed": {
        seed = undefined;
        continue MAIN_LOOP;
      }
      default:
        console.error("未知命令！");
        continue MAIN_LOOP;
    }
  }

  try {
    const parsed = parse(code, {
      optimizesForSimpleCases: allowsSimpleParsing,
    });
    if (parseOnly) {
      console.log(inspect(parsed, { depth: Infinity }));
      continue;
    }

    const result = execute(parsed, { seed });
    if ("error" in result) {
      if (!(result.error instanceof RuntimeError)) {
        throw new Error("Unreachable");
      }
      console.log(`runtime error:`, result.error.message);
    } else {
      console.log(
        `%c=> ${inspect(result.ok, { depth: Infinity })}`,
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
