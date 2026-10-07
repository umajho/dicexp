/**
 * Shared plumbing for the CI-style naive-vs-nova benchmark suite
 * (nova v0.6, supersedes the v0.3 playground numbers in
 * nova/docs/benchmarks.md for optimization decisions).
 *
 * Env knobs:
 * - `BENCH_SCALE` — float multiplier on sample counts (default 1); applies
 *   to both the warmup and the timed window (warmup is derived from the
 *   scaled N).
 * - `BENCH_ONLY` — substring filter on workload labels; runs only matching
 *   workloads.
 * - `NOVA_COMPILER_WASM_PATH` / `NOVA_BUILTINS_WASM_PATH` — optional
 *   absolute-path overrides for the wasm assets (e.g. to measure a
 *   no-checkpoint compiler variant against the same suite).
 *
 * Vitest runs test files in parallel by default, which would pollute the
 * timings; `acquireBenchLock`/`releaseBenchLock` serialize entire test
 * files (whichever file starts first holds the lock until it has written
 * its results). The same lock also guards the `results/latest.*` merge.
 * Locks left behind by killed runs are detected (holder pid + mtime age)
 * and broken automatically — see `acquireBenchLock`.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type * as I from "@dicexp/interface";
import { Evaluator } from "@dicexp/naive-evaluator/internal";
import { builtinScope } from "@dicexp/naive-evaluator-builtins/internal";

import { createEvaluatorSync, NovaAssets } from "../lib";
// NOTE: `Machine` is NOT part of nova's public surface — `lib.ts` exports
// only `createEvaluator`/`createEvaluatorSync`/`NovaAssets`/`evaluatorInfo`.
// The compile-vs-run split in overhead.test.ts therefore imports the
// package-internal module directly (the very class `createEvaluatorSync`
// wraps). If this path ever moves, that measurement breaks loudly.
import { Machine } from "../src/machine";

// ---------------------------------------------------------------------------
// Env knobs
// ---------------------------------------------------------------------------

function readScale(): number {
  const raw = process.env.BENCH_SCALE;
  if (raw === undefined || raw === "") return 1;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid BENCH_SCALE=${raw} (expected a positive float)`);
  }
  return value;
}

function readOnly(): string | null {
  const raw = process.env.BENCH_ONLY;
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export const BENCH_SCALE = readScale();
export const BENCH_ONLY: string | null = readOnly();

// ---------------------------------------------------------------------------
// Evaluators — constructed ONCE at module level (vitest gotcha, plan §9.1:
// synchronous construction, exactly like test/differential.test.ts).
// ---------------------------------------------------------------------------

const wasmDir = path.join(__dirname, "..", "wasm");
const COMPILER_OVERRIDE = process.env.NOVA_COMPILER_WASM_PATH ?? null;
const BUILTINS_OVERRIDE = process.env.NOVA_BUILTINS_WASM_PATH ?? null;

function loadAssets(): NovaAssets {
  const compiler = COMPILER_OVERRIDE ?? path.join(wasmDir, "nova-compiler.wasm");
  const builtins = BUILTINS_OVERRIDE ?? path.join(wasmDir, "nova-builtins.wasm");
  const shim = path.join(wasmDir, "nova-shim.wasm");
  try {
    return {
      compiler: fs.readFileSync(compiler),
      builtins: fs.readFileSync(builtins),
      shim: fs.readFileSync(shim),
    };
  } catch (e) {
    throw new Error(
      `nova wasm assets not found (${e instanceof Error ? e.message : e}); ` +
        `run \`just build-nova-wasm\` first (asset paths: ${compiler}, ${builtins}, ${shim})`,
    );
  }
}

export const assets = loadAssets();

export const naive: I.Evaluator = new Evaluator({
  topLevelScope: builtinScope,
  randomSourceMaker: "xorshift7",
});
export const nova: I.Evaluator = createEvaluatorSync(assets);

/** Raw machine for the compile/run split in overhead.test.ts. */
export const machine: Machine = Machine.createSync(assets);

// ---------------------------------------------------------------------------
// Row types + markdown formatting
// ---------------------------------------------------------------------------

export interface CompareRow {
  label: string;
  code: string;
  samples: number;
  warmup: number;
  naiveMs: number;
  naivePerSec: number;
  novaMs: number;
  novaPerSec: number;
  /** nova throughput / naive throughput (>1 ⇒ nova faster). */
  ratio: number;
  /** Non-cryptographic fingerprint of the timed values (sanity only). */
  valueDigest: string;
}

export interface OverheadRow {
  label: string;
  code: string;
  calls: number;
  naiveMsPerCall: number;
  novaMsPerCall: number;
  novaCompileMsPerCall: number;
  novaRunMsPerCall: number;
}

/** `|` breaks markdown tables — swap in `ǀ` (U+01C0), as benchmarks.md does. */
function mdCell(text: string): string {
  return text.replace(/\|/g, "ǀ");
}

export function fmtMs(ms: number): string {
  return ms.toFixed(1);
}

export function fmtMsPrecise(ms: number): string {
  return ms.toFixed(4);
}

export function fmtRate(perSec: number): string {
  return perSec >= 1000 ? `${(perSec / 1000).toFixed(1)}k/s` : `${perSec.toFixed(1)}/s`;
}

export function fmtRatio(r: number): string {
  return `${r.toFixed(2)}×`;
}

export const COMPARE_TABLE_HEADER =
  "| label | samples | naive ms | naive samples/s | nova ms | nova samples/s | nova/naive |" +
  "\n|---|---:|---:|---:|---:|---:|---:|";

export function compareRowToMd(row: CompareRow): string {
  return `| ${mdCell(row.label)} | ${row.samples} | ${fmtMs(row.naiveMs)} | ` +
    `${fmtRate(row.naivePerSec)} | ${fmtMs(row.novaMs)} | ${fmtRate(row.novaPerSec)} | ` +
    `${fmtRatio(row.ratio)} |`;
}

export const OVERHEAD_TABLE_HEADER =
  "| code | calls | naive ms/call | nova ms/call | nova compile ms/call | nova run ms/call | compile+run ms/call |" +
  "\n|---|---:|---:|---:|---:|---:|---:|";

export function overheadRowToMd(row: OverheadRow): string {
  const split = row.novaCompileMsPerCall + row.novaRunMsPerCall;
  return `| ${mdCell(row.label)} | ${row.calls} | ${fmtMsPrecise(row.naiveMsPerCall)} | ` +
    `${fmtMsPrecise(row.novaMsPerCall)} | ${fmtMsPrecise(row.novaCompileMsPerCall)} | ` +
    `${fmtMsPrecise(row.novaRunMsPerCall)} | ${fmtMsPrecise(split)} |`;
}

/** FNV-1a-style fold over a value array (sanity fingerprint, not crypto). */
export function digest(values: I.JSValue[]): string {
  let h = 0x811c9dc5;
  const fold = (v: I.JSValue) => {
    if (Array.isArray(v)) {
      for (const x of v) fold(x);
      return;
    }
    const n = typeof v === "number" ? v : v ? 0xb00b5 : 0x1badb002;
    h = Math.imul(h ^ n, 0x01000193);
  };
  for (const v of values) fold(v);
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Cross-file sequencing + results store
// ---------------------------------------------------------------------------

export const resultsDir = path.join(__dirname, "results");

export interface BenchMeta {
  date: string;
  machine: { platform: string; arch: string; node: string };
  env: {
    benchScale: number;
    benchOnly: string | null;
    compilerOverride: string | null;
    builtinsOverride: string | null;
  };
}

function currentMeta(): BenchMeta {
  return {
    date: new Date().toISOString(),
    machine: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    },
    env: {
      benchScale: BENCH_SCALE,
      benchOnly: BENCH_ONLY,
      compilerOverride: COMPILER_OVERRIDE,
      builtinsOverride: BUILTINS_OVERRIDE,
    },
  };
}

const lockDir = () => path.join(resultsDir, ".lock");
let lockHeld = false;

// Stale-lock policy. A plain mkdir-lock has no heartbeat: a run killed
// hard (SIGKILL ⇒ no `finally`, no `afterAll`) leaves the dir behind, and
// the original code then made every later run spin for the full 30-min
// wait deadline before erroring — indistinguishable from a hang. So:
// - The holder writes its pid into the lock dir immediately after mkdir.
// - A waiter BREAKS the lock when the recorded pid is no longer alive, or
//   when there is no pid file and the dir is older than
//   LOCK_STALE_GRACE_MS (covers old-format locks and holders that died in
//   the mkdir→pid-write window).
// - A live pid means a genuinely concurrent run: keep waiting, since the
//   lock exists precisely to keep timings unpolluted. `process.kill(pid,
//   0)` can false-positive on pid reuse; staying quiet (waiting) is the
//   conservative failure there, capped by LOCK_WAIT_TIMEOUT_MS.
const LOCK_STALE_GRACE_MS = 10_000;
const LOCK_WAIT_TIMEOUT_MS = 10 * 60_000;
const LOCK_POLL_MS = 50;

function readLockPid(): number | null {
  try {
    const pid = Number.parseInt(
      fs.readFileSync(path.join(lockDir(), "pid"), "utf8").trim(),
      10,
    );
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM ⇒ the process exists but we may not signal it: alive.
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lockAgeMs(): number {
  try {
    return Date.now() - fs.statSync(lockDir()).mtimeMs;
  } catch {
    return 0;
  }
}

/** Why the current lock is breakable; null ⇒ it looks live, keep waiting. */
function staleLockReason(): string | null {
  const pid = readLockPid();
  if (pid !== null) {
    return pidAlive(pid) ? null : `holder pid ${pid} is dead`;
  }
  const age = lockAgeMs();
  if (age < LOCK_STALE_GRACE_MS) {
    return null; // mkdir just won the race; the pid file isn't written yet
  }
  return `no pid file and the dir is ${Math.round(age / 1000)}s old`;
}

/**
 * Serialize whole bench test files against each other (mkdir is atomic, so
 * this works across vitest's workers/processes). Holds until
 * `releaseBenchLock` — see the module header for why parallel files would
 * pollute the timings. Locks left by killed runs are broken automatically
 * (see the stale-lock policy above the helpers); a lock held by a LIVE
 * process is waited on, up to `LOCK_WAIT_TIMEOUT_MS`, then this fails
 * loudly instead of hanging.
 */
export async function acquireBenchLock(): Promise<void> {
  fs.mkdirSync(resultsDir, { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lockDir());
    } catch {
      const reason = staleLockReason();
      if (reason !== null) {
        console.error(`[bench] breaking stale lock ${lockDir()} (${reason})`);
        fs.rmSync(lockDir(), { recursive: true, force: true });
        continue; // reclaim immediately
      }
      if (Date.now() > deadline) {
        throw new Error(
          `bench lock ${lockDir()} still held after ` +
            `${LOCK_WAIT_TIMEOUT_MS / 60_000} min by live process pid ` +
            `${readLockPid() ?? "?"} — another bench run appears to be ` +
            `active; wait for it or remove the dir if that is wrong`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS));
      continue;
    }
    try {
      fs.writeFileSync(path.join(lockDir(), "pid"), `${process.pid}\n`);
    } catch {
      // Best effort; without a pid file the age rule reclaims the lock.
    }
    lockHeld = true;
    return;
  }
}

export function releaseBenchLock(): void {
  if (!lockHeld) return;
  lockHeld = false;
  fs.rmSync(lockDir(), { recursive: true, force: true });
}

/**
 * Persist one bench file's rows: `results/<source>.{json,md}` (fresh) and
 * rebuild the merged `results/latest.{json,md}` from every per-source
 * artifact present — idempotent whichever file finishes last. Must be
 * called while holding the bench lock.
 */
export function writeResults(
  source: string,
  rows: unknown[],
  mdSection: string,
): void {
  fs.mkdirSync(resultsDir, { recursive: true });
  const meta = currentMeta();
  fs.writeFileSync(
    path.join(resultsDir, `${source}.json`),
    JSON.stringify({ ...meta, source, rows }, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(resultsDir, `${source}.md`),
    mdSection.trimEnd() + "\n",
  );

  const perSourceJson = fs.readdirSync(resultsDir)
    .filter((f) => f.endsWith(".json") && f !== "latest.json")
    .sort();
  const sources: Record<string, unknown> = {};
  for (const f of perSourceJson) {
    sources[f.slice(0, -".json".length)] = JSON.parse(
      fs.readFileSync(path.join(resultsDir, f), "utf8"),
    );
  }
  fs.writeFileSync(
    path.join(resultsDir, "latest.json"),
    JSON.stringify({ ...meta, sources }, null, 2) + "\n",
  );

  const parts = [
    `# nova bench results — ${meta.date}`,
    "",
    `Machine: ${meta.machine.platform}/${meta.machine.arch}, ` +
      `node ${meta.machine.node} — BENCH_SCALE=${meta.env.benchScale}` +
      (meta.env.benchOnly !== null
        ? `, BENCH_ONLY=${JSON.stringify(meta.env.benchOnly)}`
        : ""),
    "",
  ];
  const perSourceMd = fs.readdirSync(resultsDir)
    .filter((f) => f.endsWith(".md") && f !== "latest.md")
    .sort();
  for (const f of perSourceMd) {
    parts.push(fs.readFileSync(path.join(resultsDir, f), "utf8").trimEnd(), "");
  }
  fs.writeFileSync(path.join(resultsDir, "latest.md"), parts.join("\n") + "\n");
}
