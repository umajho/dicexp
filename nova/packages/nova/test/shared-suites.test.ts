/**
 * The nova consumer of the shared suites
 * (`@dicexp/test-utils-for-executing` — plan.md §9): naive's semantic test
 * tables run against nova, with only the compat.md-documented divergences
 * tagged/skipped/overridden.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  defineBaseFunctionsSuite,
  defineBaseOperatorsSuite,
  defineExecutingSuite,
  defineParsingSuite,
  EvaluationTester,
  ParseResultForTest,
  ParsingSuiteContext,
  SuiteContext,
} from "@dicexp/test-utils-for-executing";

import { createEvaluatorSync, NovaAssets } from "../lib";

const wasmDir = path.join(__dirname, "..", "wasm");

function loadAssets(): NovaAssets | null {
  try {
    return {
      compiler: fs.readFileSync(path.join(wasmDir, "nova-compiler.wasm")),
      builtins: fs.readFileSync(path.join(wasmDir, "nova-builtins.wasm")),
      shim: fs.readFileSync(path.join(wasmDir, "nova-shim.wasm")),
    };
  } catch {
    return null;
  }
}

const assets = loadAssets();
if (!assets) {
  throw new Error(
    "nova wasm assets not found; run `just build-nova-wasm` first",
  );
}

// Created synchronously at module level (like this package's conformance
// test and naive's) so the shared suites can register cases at
// describe-collection time (plan.md §9.1).
const evaluator = createEvaluatorSync(assets);
const tester = new EvaluationTester(evaluator);

/**
 * nova has no separate parse step: its compiler does name resolution, so
 * `evaluate` classifies — parse-class errors (including compile-time
 * unknown-name errors, compat.md §3 working as intended) become
 * `["error", …]`; everything else (ok, or a runtime error — post-parse)
 * becomes `["ok", null]`: nova has no node representation.
 */
const parse = (code: string): ParseResultForTest => {
  const result = evaluator.evaluate(code, { execution: { seed: 0 } });
  if (result[0] === "error" && result[1] === "parse") {
    return ["error", { message: result[2].message }];
  }
  return ["ok", null];
};

const ctx: SuiteContext = {
  impl: "nova",
  tester,
  // nova links its builtins (no scoping): the default tester resolves
  // every name, so every per-block scope request gets it.
  makeTesterFor: (_names) => tester,
  // makeSleepTester stays undefined: nova's soft timeout is roadmap v0.5;
  // the soft-timeout block skips (tag "naive-soft-timeout").
};

defineExecutingSuite(ctx);
defineBaseFunctionsSuite(ctx);
defineBaseOperatorsSuite(ctx);

const parsingCtx: ParsingSuiteContext = { impl: "nova", parse };
defineParsingSuite(parsingCtx);
