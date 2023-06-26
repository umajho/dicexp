import { execute, parse } from "dicexp";
import { standardScopeCollection } from "@dicexp/builtins/internal";

// import inspect from "browser-util-inspect";
// REPL 不用在非 Node 环境下运行，就直接用了
import { inspect } from "util";

import _prompt from "prompt-sync";
const prompt = _prompt({ sigint: true });

let seed: number | undefined = undefined;

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
    const parseResult = parse(code);
    if ("error" in parseResult) {
      console.error("parsing error:", parseResult.error.message);
      continue;
    }
    const parsed = parseResult.ok;
    if (parseOnly) {
      console.log(inspect(parsed, { depth: Infinity }));
      continue;
    }

    const executeResult = execute(parsed, {
      topLevelScope: standardScopeCollection,
      seed,
    });
    if ("error" in executeResult) {
      console.error(`runtime error:`, executeResult.error.message);
      continue;
    }
    const executed = executeResult.ok;
    let extraInfo = "";
    if (parseResult.simple) {
      extraInfo = " (w/ simple)";
    }
    console.log(
      `=>${extraInfo} %c${inspect(executed, { depth: Infinity })}`,
      "color: green",
    );
  } catch (e) {
    if (e instanceof Error) {
      console.error("unknown error:", e);
    } else {
      console.error("unknown thrown:", e);
    }
  }
}
