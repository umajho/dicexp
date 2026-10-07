import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { createEvaluator, NovaAssets } from "../lib";

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

describe.skipIf(assets === null)("smoke (requires built wasm assets)", () => {
  it("evaluates an integer literal", async () => {
    const evaluator = await createEvaluator(assets!);
    const result = evaluator.evaluate("42", { execution: { seed: 0 } });
    expect(result[0]).toBe("ok");
    if (result[0] === "ok") expect(result[1]).toBe(42);
  });
});
