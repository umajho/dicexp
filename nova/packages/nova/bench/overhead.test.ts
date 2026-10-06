/**
 * Small-expression overhead benchmark (nova v0.6): the per-call cost of
 * `evaluate(code, {execution: {seed: i}})` for trivial programs, naive vs
 * nova — the floor that dominates trivial-program sampling rates.
 *
 * Method (per code, one `it`):
 * - K = 2000 single-shot `evaluate` calls per implementation, rotating
 *   seeds 0..K−1 (200 untimed warmup calls first, so JIT/IC state does not
 *   dominate the timed window).
 * - Additionally, for nova only, the compile-vs-run split:
 *   compile-only = `machine.compileSource(code)` per call; run-only =
 *   `machine.runCompiled(module, tableSize, seed)` per call on a module
 *   compiled once. Sanity: compile+run should ≈ the full `evaluate` cost.
 *
 * `Machine` is NOT exported from the public surface (`../lib` — see
 * ./support), so the split is measured through the package-internal
 * `../src/machine`; that is a bench-only reach into the package's own
 * sources, not a public API.
 *
 * Knobs: `BENCH_SCALE`, `BENCH_ONLY` (see ./support; BENCH_ONLY filters on
 * the code strings here). Results are written to bench/results/ (merged
 * with compare's).
 */

import { afterAll, beforeAll, describe, it } from "vitest";

import type * as I from "@dicexp/interface";

import {
  BENCH_ONLY,
  OVERHEAD_TABLE_HEADER,
  acquireBenchLock,
  machine,
  naive,
  nova,
  overheadRowToMd,
  releaseBenchLock,
  writeResults,
  type OverheadRow,
} from "./support";

const TEST_TIMEOUT_MS = 10 * 60_000;
const HOOK_TIMEOUT_MS = 30 * 60_000;

const CALLS = 2_000;
const WARMUP = 200;

const WORKLOADS: { label: string; code: string }[] = [
  { label: "d6", code: "d6" },
  { label: "sum([1, 2, 3])", code: "sum([1, 2, 3])" },
];

const selected = WORKLOADS.filter(
  (w) => BENCH_ONLY === null || w.label.includes(BENCH_ONLY),
);

const rows: OverheadRow[] = [];

function expectOk(result: I.EvaluationResult): void {
  if (result[0] !== "ok") {
    const detail = result[1] === "runtime"
      ? result[2].message
      : result[1] === "parse"
        ? result[2].message
        : result[2] instanceof Error
          ? result[2].message
          : String(result[2]);
    throw new Error(`bench evaluation failed: ${detail}`);
  }
}

/** Checked unwrap for the hot loops (the branch is negligible anyway). */
function ok<T extends { ok: boolean }>(outcome: T): Extract<T, { ok: true }> {
  if (outcome.ok) return outcome as Extract<T, { ok: true }>;
  throw new Error("bench: unexpected non-ok outcome");
}

beforeAll(acquireBenchLock, HOOK_TIMEOUT_MS);

afterAll(() => {
  try {
    const table = [
      OVERHEAD_TABLE_HEADER,
      ...rows.map(overheadRowToMd),
    ].join("\n");
    console.log(`\nbench(overhead)\n${table}\n`);
    const note =
      "\nPer-call averages over K=2000 seeded `evaluate` calls (naive, " +
      "nova) plus nova's compile-only / run-only split via the internal " +
      "`Machine` (not on the public `../lib` surface).";
    writeResults(
      "overhead",
      rows,
      `## small-expression overhead\n\n${table}\n${note}`,
    );
  } finally {
    releaseBenchLock();
  }
});

describe("bench(overhead): small-expression per-call cost", () => {
  if (selected.length === 0) {
    it(
      `skips: no code matches BENCH_ONLY=${JSON.stringify(BENCH_ONLY)}`,
      () => {
        console.log(
          `bench(overhead): BENCH_ONLY=${JSON.stringify(BENCH_ONLY)} ` +
            `matched no code; nothing to do.`,
        );
      },
    );
    return;
  }

  for (const { label, code } of selected) {
    it(
      label,
      { timeout: TEST_TIMEOUT_MS },
      () => {
        // Warmup (untimed).
        for (let i = 0; i < WARMUP; i++) {
          expectOk(naive.evaluate(code, { execution: { seed: i } }));
          expectOk(nova.evaluate(code, { execution: { seed: i } }));
        }

        // Full per-call cost, one implementation at a time.
        const naiveStart = performance.now();
        for (let i = 0; i < CALLS; i++) {
          expectOk(naive.evaluate(code, { execution: { seed: i } }));
        }
        const naiveMs = performance.now() - naiveStart;

        const novaStart = performance.now();
        for (let i = 0; i < CALLS; i++) {
          expectOk(nova.evaluate(code, { execution: { seed: i } }));
        }
        const novaMs = performance.now() - novaStart;

        // nova split — compile-only (dicexp source → program wasm module).
        for (let i = 0; i < WARMUP; i++) {
          ok(machine.compileSource(code));
        }
        const compileStart = performance.now();
        for (let i = 0; i < CALLS; i++) {
          ok(machine.compileSource(code));
        }
        const compileMs = performance.now() - compileStart;

        // nova split — run-only (instantiate + __main + finalize + decode)
        // on a module compiled once, rotating seeds.
        const compiled = ok(machine.compileSource(code));
        for (let i = 0; i < WARMUP; i++) {
          ok(machine.runCompiled(compiled.module, compiled.tableSize, i));
        }
        const runStart = performance.now();
        for (let i = 0; i < CALLS; i++) {
          ok(machine.runCompiled(compiled.module, compiled.tableSize, i));
        }
        const runMs = performance.now() - runStart;

        const row: OverheadRow = {
          label,
          code,
          calls: CALLS,
          naiveMsPerCall: naiveMs / CALLS,
          novaMsPerCall: novaMs / CALLS,
          novaCompileMsPerCall: compileMs / CALLS,
          novaRunMsPerCall: runMs / CALLS,
        };
        rows.push(row);
        console.log(overheadRowToMd(row));
      },
    );
  }
});
