/**
 * `I.Evaluator` implementation backed by the nova WASM machinery.
 */

import type * as I from "@dicexp/interface";

import { localizeZh } from "./locale/zh";
import { Machine, NovaAssets } from "./machine";
import { DecodedCompileError } from "./protocol";

export async function createEvaluator(
  assets: NovaAssets,
): Promise<I.Evaluator> {
  const machine = await Machine.create(assets);
  return new NovaEvaluator(machine);
}

/**
 * Synchronous creation — only usable where synchronous WASM compilation is
 * allowed (Node, workers; NOT browsers' main thread for large modules).
 */
export function createEvaluatorSync(assets: NovaAssets): I.Evaluator {
  return new NovaEvaluator(Machine.createSync(assets));
}

class NovaEvaluator implements I.Evaluator {
  constructor(private readonly machine: Machine) {}

  evaluate(code: string, opts: I.EvaluationOptions): I.EvaluationResult {
    const startMs = Date.now();
    const appendix = (): I.ExecutionAppendix => ({
      representation: null,
      statistics: { timeConsumption: { ms: Date.now() - startMs } },
    });

    try {
      const compiled = this.machine.compileSource(code);
      if (!compiled.ok) {
        return ["error", "parse", toParseError(compiled.errors, code)];
      }

      const outcome = this.machine.runCompiled(
        compiled.module,
        compiled.tableSize,
        opts.execution.seed,
        // Plan §3.9: restrictions are per-evaluation (the generator interface
        // has none — its options are an empty reserved struct).
        { softTimeoutMs: opts.execution.restrictions?.softTimeout?.ms },
      );
      if (!outcome.ok) {
        return [
          "error",
          "runtime",
          { message: localizeZh(outcome.error) },
          appendix(),
        ];
      }
      return ["ok", outcome.value as I.JSValue, appendix()];
    } catch (e) {
      return ["error", "other", e instanceof Error ? e : new Error(String(e))];
    }
  }

  makeEvaluationGenerator(
    code: string,
    _opts: I.EvaluationGenerationOptions,
  ): I.MakeEvaluationGeneratorResult {
    const startMs = Date.now();
    const appendix = (): I.ExecutionAppendix => ({
      representation: null,
      statistics: { timeConsumption: { ms: Date.now() - startMs } },
    });

    let compiled: Extract<
      ReturnType<Machine["compileSource"]>,
      { ok: true }
    >;
    try {
      const outcome = this.machine.compileSource(code);
      if (!outcome.ok) {
        return ["error", "parse", toParseError(outcome.errors, code)];
      }
      compiled = outcome;
    } catch (e) {
      return ["error", "other", e instanceof Error ? e : new Error(String(e))];
    }

    const machine = this.machine;
    return [
      "ok",
      (function* (): I.EvaluationGenerator {
        for (let seed = 0;; seed++) {
          try {
            const outcome = machine.runCompiled(
              compiled.module,
              compiled.tableSize,
              seed,
            );
            if (!outcome.ok) {
              return [
                "error",
                "runtime",
                { message: localizeZh(outcome.error) },
                appendix(),
              ];
            }
            yield ["ok", outcome.value as I.JSValue, appendix()];
          } catch (e) {
            return [
              "error",
              "other",
              e instanceof Error ? e : new Error(String(e)),
            ];
          }
        }
      })(),
    ];
  }
}

function toParseError(
  errors: DecodedCompileError[],
  source: string,
): I.ParseError {
  const first = errors[0];
  if (!first) return { message: "语法错误" };
  return {
    message: localizeZh(first, {
      // The compiler tokenized the half-width-normalized source (spans are
      // char indices into it, 1:1 per char with the original), and naive's
      // parse-error excerpts show the normalized text — normalize here too.
      source: toHalfWidth(source),
      span: { start: first.start, end: first.end },
    }),
  };
}

/**
 * naive's `convertTextToHalfWidth` (`parsing/utils.ts`; same mapping as the
 * compiler-side `to_half_width`): U+FF01..=U+FF5E → ASCII, 1:1 per char.
 */
function toHalfWidth(source: string): string {
  return source.replace(
    /[！-～]/g,
    (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0),
  );
}
