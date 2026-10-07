/**
 * CI-style naive-vs-nova benchmark (nova v0.6) — supersedes the v0.3
 * playground measurements (nova/docs/benchmarks.md) for optimization
 * decisions.
 *
 * Method (per workload, one `it`):
 * - Both evaluators are constructed ONCE at module level (via ./support,
 *   mirroring test/differential.test.ts; plan §9.1 vitest gotcha).
 * - `makeEvaluationGenerator(code, {})` on both; each generator starts at
 *   seed 0 and advances one seed per pull.
 * - Warm up each implementation with `max(100, N/10)` UNTIMED pulls, then
 *   time N pulls. Warmup counts are identical on both sides, so the two
 *   timed windows cover the SAME seed range — the agreement assert
 *   compares the timed windows pairwise.
 * - Sequential measurement, naive first then nova (v0.3 method): the two
 *   implementations never compete for CPU. Whole-file sequencing against
 *   the other bench file is enforced by the lock in ./support.
 * - Unlike the v0.3 playground mode, the one-time parse/compile happens in
 *   `makeEvaluationGenerator` — OUTSIDE the timed window. These numbers
 *   are steady-state sampling rates; the one-shot cost is measured
 *   separately in overhead.test.ts.
 * - This is a measurement tool, not a correctness gate beyond the exact
 *   agreement assert (`expect(novaValues).toEqual(naiveValues)`).
 *
 * Knobs: `BENCH_SCALE`, `BENCH_ONLY` (see ./support). Results are written
 * to bench/results/ (latest.json + latest.md, merged with overhead's).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as I from "@dicexp/interface";

import {
  BENCH_ONLY,
  BENCH_SCALE,
  COMPARE_TABLE_HEADER,
  acquireBenchLock,
  compareRowToMd,
  digest,
  naive,
  nova,
  releaseBenchLock,
  writeResults,
  type CompareRow,
} from "./support";
import { benchmarkPresets } from "./workloads";

/** The d6 preset is 1M samples at BENCH_SCALE=1 — be generous. */
const TEST_TIMEOUT_MS = 10 * 60_000;
/** Must cover a whole-file wait on the cross-file sequencing lock. */
const HOOK_TIMEOUT_MS = 30 * 60_000;

const selected = benchmarkPresets.filter(
  (p) => BENCH_ONLY === null || p.label.includes(BENCH_ONLY),
);

const rows: CompareRow[] = [];

function generatorOf(
  evaluator: I.Evaluator,
  code: string,
): I.EvaluationGenerator {
  const result = evaluator.makeEvaluationGenerator(code, {});
  if (result[0] !== "ok") {
    const detail = result[1] === "parse"
      ? result[2].message
      : result[2] instanceof Error
        ? result[2].message
        : String(result[2]);
    throw new Error(
      `makeEvaluationGenerator failed for ${JSON.stringify(code)}: ${detail}`,
    );
  }
  return result[1];
}

/** Pull `n` values from a generator, collecting the evaluated values. */
function pull(gen: I.EvaluationGenerator, n: number): I.JSValue[] {
  const values: I.JSValue[] = [];
  for (let i = 0; i < n; i++) {
    const r = gen.next();
    if (r.done) {
      const ret = r.value;
      const detail = ret[1] === "runtime" ? ret[2].message : String(ret[2]);
      throw new Error(
        `generator terminated after ${values.length} pulls: ${detail}`,
      );
    }
    values.push(r.value[1]);
  }
  return values;
}

beforeAll(acquireBenchLock, HOOK_TIMEOUT_MS);

afterAll(() => {
  try {
    const table = [
      COMPARE_TABLE_HEADER,
      ...rows.map(compareRowToMd),
    ].join("\n");
    console.log(
      `\nbench(compare) — BENCH_SCALE=${BENCH_SCALE}\n${table}\n`,
    );
    const note =
      "\nTimed windows are seeds [warmup, warmup+samples) on BOTH " +
      "implementations (identical warmup counts), naive run first; the " +
      "one-time parse/compile is outside the window (steady-state rates, " +
      "cf. the v0.3 playground method in nova/docs/benchmarks.md).";
    writeResults(
      "compare",
      rows,
      `## naive vs nova — preset workloads\n\n${table}\n${note}`,
    );
  } finally {
    releaseBenchLock();
  }
});

describe("bench(compare): naive vs nova — preset workloads", () => {
  if (selected.length === 0) {
    it(
      `skips: no preset label matches BENCH_ONLY=${JSON.stringify(BENCH_ONLY)}`,
      () => {
        console.log(
          `bench(compare): BENCH_ONLY=${JSON.stringify(BENCH_ONLY)} ` +
            `matched no workload; nothing to do.`,
        );
      },
    );
    return;
  }

  for (const preset of selected) {
    it(
      preset.label,
      { timeout: TEST_TIMEOUT_MS },
      () => {
        const samples = Math.max(
          1,
          Math.round(preset.defaultSampleCount * BENCH_SCALE),
        );
        const warmup = Math.max(100, Math.round(samples / 10));

        // Fresh generators (each starts at seed 0). Identical warmup on
        // both sides ⇒ identical seed ranges for the timed windows.
        const naiveGen = generatorOf(naive, preset.code);
        const novaGen = generatorOf(nova, preset.code);

        pull(naiveGen, warmup);
        pull(novaGen, warmup);

        // Sequential: naive first, then nova — never concurrent.
        const naiveStart = performance.now();
        const naiveValues = pull(naiveGen, samples);
        const naiveMs = performance.now() - naiveStart;

        const novaStart = performance.now();
        const novaValues = pull(novaGen, samples);
        const novaMs = performance.now() - novaStart;

        expect(novaValues).toEqual(naiveValues);

        const row: CompareRow = {
          label: preset.label,
          code: preset.code,
          samples,
          warmup,
          naiveMs,
          naivePerSec: (samples * 1000) / naiveMs,
          novaMs,
          novaPerSec: (samples * 1000) / novaMs,
          ratio: naiveMs / novaMs,
          valueDigest: digest(naiveValues),
        };
        rows.push(row);
        console.log(compareRowToMd(row));
      },
    );
  }
});
