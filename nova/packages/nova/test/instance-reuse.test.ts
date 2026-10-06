/**
 * v0.6 program-instance reuse on the sampling path (nova/docs/benchmarks.md:
 * per-sample `new WebAssembly.Instance(program)` dominated trivial programs,
 * nova 0.52× naive on `d6`). Pins the reuse's correctness contracts through
 * the public evaluator surface only:
 *
 * - per-seed equality between a reused generator and fresh one-shot
 *   `evaluate` runs,
 * - shared-table epoch re-instantiation when other programs (one-shot or
 *   prepared) interleave between two pulls,
 * - soft-timeout disarm (per-run `reset`) / re-arm across reuse,
 * - statelessness at stress scale,
 * - runtime-error stability of reused runs.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type * as I from "@dicexp/interface";

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

function makeGen(evaluator: I.Evaluator, code: string): I.EvaluationGenerator {
  const result = evaluator.makeEvaluationGenerator(code, { execution: {} });
  if (result[0] !== "ok") {
    throw new Error(`generator failed: ${JSON.stringify(result)}`);
  }
  return result[1];
}

function pullOne(gen: I.EvaluationGenerator): I.JSValue {
  const r = gen.next();
  if (r.done) {
    throw new Error(`generator finished early: ${JSON.stringify(r.value)}`);
  }
  return r.value[1];
}

function pullValues(gen: I.EvaluationGenerator, n: number): I.JSValue[] {
  const values: I.JSValue[] = [];
  for (let i = 0; i < n; i++) values.push(pullOne(gen));
  return values;
}

function expectOk(result: I.EvaluationResult, value: I.JSValue): void {
  if (result[0] !== "ok") {
    throw new Error(`expected ok, got: ${JSON.stringify(result)}`);
  }
  expect(result[1]).toStrictEqual(value);
}

function expectRuntimeError(
  result: I.EvaluationResult,
  message: string,
): void {
  if (result[0] !== "error" || result[1] !== "runtime") {
    throw new Error(`expected runtime error, got: ${JSON.stringify(result)}`);
  }
  expect(result[2].message).toBe(message);
}

/**
 * Reference values via fresh one-shot `evaluate` per seed (nova
 * self-comparison — same RNG stream per seed makes the seed the only
 * variable; computed before the generator exists so the reused instance is
 * never stale during the compared pulls).
 */
function perSeedReference(
  evaluator: I.Evaluator,
  code: string,
  n: number,
): I.JSValue[] {
  return Array.from({ length: n }, (_, seed) => {
    const result = evaluator.evaluate(code, { execution: { seed } });
    if (result[0] !== "ok") {
      throw new Error(`reference evaluate failed: ${JSON.stringify(result)}`);
    }
    return result[1];
  });
}

describe("program-instance reuse", () => {
  it("reused generator matches fresh per-seed evaluate (seeds 0..199)", () => {
    const evaluator = createEvaluatorSync(assets);
    const code = "d10 ~ 3d8+10";
    const expected = perSeedReference(evaluator, code, 200);

    const values = pullValues(makeGen(evaluator, code), 200);
    expect(values).toStrictEqual(expected);
  });

  it("interleaving other programs between pulls re-binds the shared table", () => {
    const evaluator = createEvaluatorSync(assets);
    // B: the sampled program. A: closure-heavy (map + closure + sum) — a
    // different table size than B's dice shape, so A's active element
    // segments overwrite a different-width span of the shared table. A
    // stale B instance would call A's functions at B's slots.
    const codeB = "d10 ~ 3d8+10";
    const codeA = "map([1, 2, 3, 4, 5], |$x| $x * 2) |> sum";

    // Uninterleaved reference: a B generator consumed in one go.
    const reference = pullValues(makeGen(evaluator, codeB), 120);

    // Interleaved run: pull B, run one-shot A, pull B, pull a *prepared* A
    // generator (mutual prepared-vs-prepared invalidation), pull B again.
    const genB = makeGen(evaluator, codeB);
    const first = pullValues(genB, 40);
    expectOk(evaluator.evaluate(codeA, { execution: { seed: 7 } }), 30);
    const mid = pullValues(genB, 40);
    const genA = makeGen(evaluator, codeA);
    expect(pullOne(genA)).toBe(30);
    const last = pullValues(genB, 40);

    expect([...first, ...mid, ...last]).toStrictEqual(reference);
  });

  it("soft timeout fires, disarms, re-arms across reuse; generator unaffected", () => {
    const evaluator = createEvaluatorSync(assets);
    // The shared-suite nova busy shape (软性超时 rows): the deadline passes
    // during `sum`'s checkpoint-silent loop and fires on the next forced
    // call — `(|| true).()` here. (The bare `300000#1 |> sum` does NOT
    // fire: there is no call after the deadline — that's the other shared
    // suite row, not an error case.)
    const busy = "((300000#1 |> sum) > 0) and (|| true).()";
    const message = "越过外加限制「运行时间」（允许 10 毫秒）";
    const opts = (seed: number): I.EvaluationOptions => ({
      execution: {
        seed,
        restrictions: { softTimeout: { ms: 10 } },
      },
    });

    expectRuntimeError(evaluator.evaluate(busy, opts(0)), message);

    // No restrictions on the same evaluator: ok. Pins that the per-run
    // `reset()` disarmed the fired timeout — the `+` call site would fire
    // on a leftover deadline.
    expectOk(evaluator.evaluate("1 + 1", { execution: { seed: 0 } }), 2);

    // Re-armed per run when requested again: fires again.
    expectRuntimeError(evaluator.evaluate(busy, opts(1)), message);

    // A generator on the same evaluator still works afterwards — generator
    // runs never arm a timeout, and each run's reset clears any residue.
    const gen = makeGen(evaluator, "d6");
    for (let i = 0; i < 5; i++) {
      const v = pullOne(gen) as number;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it("stress: 10k d6 samples through one generator stay clean", () => {
    const evaluator = createEvaluatorSync(assets);
    const expected = perSeedReference(evaluator, "d6", 200);

    const values = pullValues(makeGen(evaluator, "d6"), 10_000);

    expect(values).toHaveLength(10_000);
    expect(values.slice(0, 200)).toStrictEqual(expected);
    // Spot-check the rest for state leakage: every sample a die value.
    expect(
      values.every(
        (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 6,
      ),
    ).toBe(true);
  });

  it("runtime errors are stable across reused runs", () => {
    const evaluator = createEvaluatorSync(assets);
    const code = "1 // 0";
    const message = "操作 “1 // 0” 非法：除数不能为零";

    // One generator: the first sample errors, and the error is terminal
    // (the generator returns it — pre-existing semantics, unchanged by
    // reuse; a generator therefore delivers at most one error).
    const gen = makeGen(evaluator, code);
    const terminal = gen.next();
    expect(terminal.done).toBe(true);
    const yielded = terminal.value;
    if (yielded[0] !== "error" || yielded[1] !== "runtime") {
      throw new Error(`expected terminal runtime error: ${JSON.stringify(yielded)}`);
    }
    expect(yielded[2].message).toBe(message);
    expect(gen.next().done).toBe(true);

    // Consecutive erroring runs on the machine all decode identically.
    for (const seed of [0, 1, 2]) {
      expectRuntimeError(evaluator.evaluate(code, { execution: { seed } }), message);
    }

    // An erroring one-shot run interleaved between pulls does not corrupt
    // the prepared program (epoch re-bind + per-run reset clean up).
    const reference = perSeedReference(evaluator, "d6", 10);
    const genD = makeGen(evaluator, "d6");
    const before = pullValues(genD, 3);
    expectRuntimeError(evaluator.evaluate(code, { execution: { seed: 99 } }), message);
    const after = pullValues(genD, 7);
    expect([...before, ...after]).toStrictEqual(reference);
  });
});
