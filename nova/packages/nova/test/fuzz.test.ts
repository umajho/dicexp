/**
 * Differential fuzzing: seeded random programs (test/fuzz/generator.ts)
 * over the naive∩nova compatible subset must evaluate to the same result
 * (or the same error message) in naive and nova — everything outside the
 * deliberate-divergence list in nova/docs/compat.md, whose avoidance rules
 * are encoded (with citations) in the generator.
 *
 * Configuration (deterministic):
 * - FUZZ_SEED — master seed (default 0xD1CE; decimal or 0x-prefixed)
 * - FUZZ_PROGRAMS — number of generated programs (default 1000)
 *
 * Reproduce any reported divergence with the exact same environment:
 *   cd nova/packages/nova
 *   FUZZ_SEED=<seed> FUZZ_PROGRAMS=<n> pnpm vitest --dir=test --run fuzz
 * then look for the reported program index (also shown per divergence).
 *
 * Comparison (per program, per seed): summarize() deep-equality, exactly
 * like test/differential.test.ts — `["ok", value]` deep-equal (JSON-
 * normalized, so a JS `-0` artifact in naive equals nova's i64 `0`), or
 * identical `["error", "runtime", message]`. Generated programs are
 * well-formed and stay inside the compatible subset, so ANY difference is
 * a divergence to triage — including a parse error on either side (naive
 * parses with Lezer, nova with a Rust port), and an uncaught throw on
 * either side (the generator avoids naive's known crash carve-outs by
 * construction, so a naive throw is always a divergence here).
 *
 * The one documented divergence whose shape the generator can express —
 * compat.md #9, map/zipWith poisoning naive's list error beacon — is
 * avoided in the random stream (the generator's normal path makes
 * map/zipWith closure applications provably error-free) and exercised
 * deliberately in the separate block at the bottom (BEACON_DIVERGENT,
 * asserted per-side: naive errors with the poisoned beacon, nova is ok).
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type * as I from "@dicexp/interface";
// `/internal` entries resolve to TS sources (the packages' main entries
// point at unbuilt dist/).
import { Evaluator } from "@dicexp/naive-evaluator/internal";
import { builtinScope } from "@dicexp/naive-evaluator-builtins/internal";

import { createEvaluatorSync, NovaAssets } from "../lib";
import { BEACON_DIVERGENT, generatePrograms } from "./fuzz/generator";

const wasmDir = path.join(__dirname, "..", "wasm");

function loadAssets(): NovaAssets {
  try {
    return {
      compiler: fs.readFileSync(path.join(wasmDir, "nova-compiler.wasm")),
      builtins: fs.readFileSync(path.join(wasmDir, "nova-builtins.wasm")),
      shim: fs.readFileSync(path.join(wasmDir, "nova-shim.wasm")),
    };
  } catch {
    throw new Error("nova wasm assets not found; run `just build-nova-wasm` first");
  }
}

const assets = loadAssets();

const naive: I.Evaluator = new Evaluator({
  topLevelScope: builtinScope,
  randomSourceMaker: "xorshift7",
});
const nova: I.Evaluator = createEvaluatorSync(assets);

// ---- configuration --------------------------------------------------------

function parseMasterSeed(): number {
  const raw = process.env.FUZZ_SEED;
  if (raw === undefined || raw === "") return 0xd1ce;
  const v = raw.startsWith("0x") || raw.startsWith("0X")
    ? Number.parseInt(raw, 16)
    : Number(raw);
  if (!Number.isInteger(v)) throw new Error(`FUZZ_SEED: invalid seed: ${raw}`);
  return v >>> 0;
}

function parseProgramCount(): number {
  const raw = process.env.FUZZ_PROGRAMS;
  if (raw === undefined || raw === "") return 1000;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 0) {
    throw new Error(`FUZZ_PROGRAMS: invalid count: ${raw}`);
  }
  return Math.min(v, 1_000_000);
}

const masterSeed = parseMasterSeed();
const programCount = parseProgramCount();

// Calibration (2026-10, this machine): ~0.2 ms per naive+nova evaluation
// pair for typical generated programs — 1000 programs × 3 seeds stays in
// the low seconds. The timeout scales with the program count so large
// exit-criterion runs (10k) are not cut short.
const EVAL_SEEDS = [0, 1, 2] as const;
const testTimeout = Math.max(
  30_000,
  15_000 + programCount * EVAL_SEEDS.length * 20,
);

// ---- comparison -----------------------------------------------------------

/** Reduce an EvaluationResult to its comparable essence (as in
 * test/differential.test.ts). */
function summarize(result: I.EvaluationResult): unknown {
  if (result[0] === "ok") return ["ok", result[1]];
  if (result[0] === "error" && result[1] === "runtime") {
    return ["error", "runtime", result[2].message];
  }
  if (result[0] === "error" && result[1] === "parse") {
    return ["error", "parse", result[2].message];
  }
  return [result[0], result[1], String(result[2])];
}

/**
 * Deep equality of summaries via JSON. Plain generated results contain
 * only numbers/booleans/arrays, so JSON round-trips them faithfully; it
 * additionally normalizes `-0` to `0` (a JS artifact naive can leak, e.g.
 * `(-1) * 0`, where nova produces i64 0 — the generator avoids those
 * shapes; this is the second layer).
 */
function summaryEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface Divergence {
  index: number;
  seed: number;
  source: string;
  sketchy: boolean;
  naive: { summary: unknown; threw: string | null };
  nova: { summary: unknown; threw: string | null };
}

const MAX_REPORTED = 20;

function formatDivergence(d: Divergence, shown: number, total: number): string {
  const side = (s: { summary: unknown; threw: string | null }): string =>
    s.threw !== null ? `THREW ${s.threw}` : JSON.stringify(s.summary);
  return [
    `  divergence ${shown}/${total} — program #${d.index}, seed ${d.seed}${d.sketchy ? " (sketchy)" : ""}`,
    `    program: ${JSON.stringify(d.source)}`,
    `    naive  : ${side(d.naive)}`,
    `    nova   : ${side(d.nova)}`,
  ].join("\n");
}

// ---- the run ----------------------------------------------------------------

describe("differential fuzz: naive vs nova (generated programs)", () => {
  it(
    `FUZZ_SEED=${masterSeed} FUZZ_PROGRAMS=${programCount}, seeds [${EVAL_SEEDS.join(", ")}]`,
    () => {
      // Preflight: both implementations must be usable (a stale/missing
      // lezer or wasm build makes every program diverge — fail loudly).
      for (const [name, evaluator] of [["naive", naive], ["nova", nova]] as const) {
        const s = summarize(evaluator.evaluate("1 + 1", { execution: { seed: 0 } }));
        expect(s, `${name} preflight ("1 + 1") — run \`just build-lezer\` / \`just build-nova-wasm\` at the repo root`).toEqual(["ok", 2]);
      }

      const programs = generatePrograms(masterSeed, programCount);

      // Count every divergence; keep full details for the first
      // MAX_REPORTED only (evaluation continues so the count is complete).
      const divergences: Divergence[] = [];
      let total = 0;
      for (const program of programs) {
        for (const seed of EVAL_SEEDS) {
          const opts: I.EvaluationOptions = { execution: { seed } };
          // Uncaught throws (e.g. naive's ReferenceError/RangeError crash
          // paths) are divergences by themselves: the generator avoids
          // every documented crash carve-out by construction.
          let naiveThrew: string | null = null;
          let naiveSummary: unknown = null;
          try {
            naiveSummary = summarize(naive.evaluate(program.source, opts));
          } catch (e) {
            naiveThrew = e instanceof Error ? `${e}` : String(e);
          }
          let novaThrew: string | null = null;
          let novaSummary: unknown = null;
          try {
            novaSummary = summarize(nova.evaluate(program.source, opts));
          } catch (e) {
            novaThrew = e instanceof Error ? `${e}` : String(e);
          }
          const equal = naiveThrew === null && novaThrew === null &&
            summaryEqual(naiveSummary, novaSummary);
          if (!equal) {
            total++;
            if (divergences.length < MAX_REPORTED) {
              divergences.push({
                index: program.index,
                seed,
                source: program.source,
                sketchy: program.sketchy,
                naive: { summary: naiveSummary, threw: naiveThrew },
                nova: { summary: novaSummary, threw: novaThrew },
              });
            }
          }
        }
      }

      const repro = `cd nova/packages/nova && FUZZ_SEED=${masterSeed} FUZZ_PROGRAMS=${programCount} pnpm vitest --dir=test --run fuzz`;
      const report = [
        `differential fuzz found ${total} divergence(s) across ${programCount} programs × seeds [${EVAL_SEEDS.join(", ")}]`,
        `master seed: FUZZ_SEED=${masterSeed} (default 0xD1CE) — reproduce: ${repro}`,
        divergences.map((d, i) => formatDivergence(d, i + 1, total)).join("\n"),
        total > divergences.length
          ? `  … ${total - divergences.length} more not shown (cap ${MAX_REPORTED})`
          : "",
        `triage: reproduce one program via the (seed, count, index) triple above; classify each`,
        `divergence against nova/docs/compat.md — documented ones belong in the generator's`,
        `avoidance rules, undocumented ones are bugs to report.`,
      ].filter((s) => s !== "").join("\n");

      expect(divergences, report).toEqual([]);
    },
    testTimeout,
  );
});

// ---- deliberate divergence: map/zipWith error beacon (compat.md #9) ------

/**
 * The documented divergence the generator's shape space can express
 * (compat.md #9): naive's map/zipWith break-check materializes each
 * element's error state into the list's error beacon, so a non-forcing
 * consumer still errors in naive where nova's uniform laziness returns ok.
 * The random stream avoids these shapes (its map/zipWith closure
 * applications are provably error-free), so a few fixed programs are
 * asserted per-side instead — naive errors with the poisoned beacon (the
 * closure body's / input element's error), nova is ok; the boundary row
 * (an input element the body never forces) asserts naive AGREES with nova.
 * See BEACON_DIVERGENT in test/fuzz/generator.ts for the shape taxonomy.
 */
describe("differential fuzz: deliberate map/zipWith beacon divergence (compat.md #9)", () => {
  for (const { source, naive: naiveExpected, nova: novaExpected } of BEACON_DIVERGENT) {
    it(`\`${source}\``, () => {
      // Dice-free fixed programs — asserted across every eval seed anyway.
      for (const seed of EVAL_SEEDS) {
        const opts: I.EvaluationOptions = { execution: { seed } };
        expect(
          summarize(naive.evaluate(source, opts)),
          `naive (seed ${seed})`,
        ).toEqual(naiveExpected);
        expect(
          summarize(nova.evaluate(source, opts)),
          `nova (seed ${seed})`,
        ).toEqual(novaExpected);
      }
    });
  }
});
