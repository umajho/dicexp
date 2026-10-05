import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type * as I from "@dicexp/interface";
import { EvaluationTester } from "@dicexp/test-utils-for-executing";

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

export {};

const assets = loadAssets();
if (!assets) {
  throw new Error(
    "nova wasm assets not found; run `just build-nova-wasm` first",
  );
}

// Created synchronously at module level (like naive's tests) so that
// `tester.theyAreOk(...)` can register cases at describe-collection time.
const tester = new EvaluationTester(createEvaluatorSync(assets));

describe("conformance", () => {
  describe("literals & lists", () => {
    tester.theyAreOk([
      ["1", 1],
      ["-1", -1],
      ["true", true],
      ["false", false],
      ["[1, 2, 3]", [1, 2, 3]],
      ["[]", []],
      ["[[1, 2], [3, [4]]]", [[1, 2], [3, [4]]]],
      ["1_000_000", 1000000],
      ["４２", 42], // full-width digits
    ] as [string, I.JSValue][]);
  });

  describe("arithmetic operators", () => {
    tester.theyAreOk([
      ["1 + 2", 3],
      ["5 - 8", -3],
      ["-3 * -4", 12],
      ["7 // 2", 3],
      ["-7 // 2", -3], // truncating division (i64 semantics, not |0)
      ["7 % 2", 1],
      ["2 ** 10", 1024],
      ["2 ^ 10", 1024], // alias
      ["-(3)", -3],
      ["+(3)", 3],
      ["1 + 2 * 3", 7],
      ["(1 + 2) * 3", 9],
      ["2 ** 3 ** 2", 64], // left-associative, following Elixir (intentional)
    ] as [string, I.JSValue][]);

    it("respects the safe-integer limitation", () => {
      const safe = Number.MAX_SAFE_INTEGER;
      tester.assertExecutionOk(`${safe}`, safe);
      tester.assertExecutionRuntimeError(
        `${safe} + 1`,
        "越过内在限制「最大安全整数」（允许 9007199254740991）",
      );
      tester.assertExecutionRuntimeError(
        `${-safe} - 1`,
        "越过内在限制「最小安全整数」（允许 -9007199254740991）",
      );
    });

    it("reports illegal operations with naive's exact messages", () => {
      tester.assertExecutionRuntimeError("1 // 0", "操作 “1 // 0” 非法：除数不能为零");
      tester.assertExecutionRuntimeError(
        "(-3) % 2",
        "操作 “(-3) % 2” 非法：被除数不能为负数",
      );
      tester.assertExecutionRuntimeError(
        "3 % 0",
        "操作 “3 % 0” 非法：除数必须为正数",
      );
      tester.assertExecutionRuntimeError(
        "2 ** -1",
        "操作 “2 ** -1” 非法：指数不能为负数",
      );
    });
  });

  describe("comparison & equality", () => {
    tester.theyAreOk([
      ["1 < 2", true],
      ["2 <= 2", true],
      ["3 > 2", true],
      ["3 >= 4", false],
      ["1 == 1", true],
      ["1 != 1", false],
      ["true == false", false],
      ["true != false", true],
    ] as [string, I.JSValue][]);

    it("rejects type-mismatched equality", () => {
      tester.assertExecutionRuntimeError(
        "1 == true",
        "操作 “==” 非法：两侧操作数的类型不相同",
      );
    });
  });

  describe("logic operators (short-circuit, divergent from naive)", () => {
    tester.theyAreOk([
      ["true and true", true],
      ["true and false", false],
      ["false or true", true],
      ["false or false", false],
      ["not true", false],
    ] as [string, I.JSValue][]);

    it("short-circuits: the unused side is never forced", () => {
      // In naive these error out (no short-circuit). See compat.md #1.
      tester.assertExecutionOk("false and (1 // 0 == 0)", false);
      tester.assertExecutionOk("true or (1 // 0 == 0)", true);
    });
  });

  describe("regular functions", () => {
    tester.theyAreOk([
      ["sum([1, 2, 3])", 6],
      ["sum([])", 0], // divergence: naive's behavior was a FIXME
      ["product([2, 3, 4])", 24],
      ["product([])", 1], // divergence: same FIXME
      ["any?([false, true])", true],
      ["any?([false])", false],
      ["sort([3, 1, 2])", [1, 2, 3]],
      ["[1, 2] |> append(3)", [1, 2, 3]],
      ["[1, 2, 3] |> at(1)", 2],
      ["head([1, 2])", 1],
      ["tail([1, 2, 3])", [2, 3]],
      ["zip([1, 2], [3, 4])", [[1, 3], [2, 4]]],
      ["count([1, 2, 3], |$x| $x > 1)", 2],
      ["map([1, 2], |$x| $x * 2)", [2, 4]],
      ["filter([1, 2, 3], |$x| $x >= 2)", [2, 3]],
      ["zipWith([1, 2], [10, 20], |$x, $y| $x + $y)", [11, 22]],
    ] as [string, I.JSValue][]);

    it("reports errors with naive's exact messages", () => {
      tester.assertExecutionRuntimeError(
        "[1] |> at(5)",
        "访问列表越界：列表大小为 1，提供的索引为 5",
      );
      tester.assertExecutionRuntimeError("head([])", "列表为空");
      tester.assertExecutionRuntimeError("tail([])", "列表为空");
      tester.assertExecutionRuntimeError("sum([1, true])", "传入的列表存在非「数字」项");
      tester.assertExecutionRuntimeError("any?([1])", "传入的列表存在非「布尔」项");
      tester.assertExecutionRuntimeError("sort([[1]])", "传入的列表不支持排序");
    });
  });

  describe("laziness", () => {
    it("does not force unused list elements / at / head results", () => {
      tester.assertExecutionOk("[1, 1 // 0] |> at(0)", 1);
      tester.assertExecutionOk("[1, 1 // 0] |> head", 1);
      tester.assertExecutionOk("append([1], 1 // 0) |> at(0)", 1);
    });
    it("forces errors that are actually demanded", () => {
      tester.assertExecutionRuntimeError(
        "[1, 1 // 0] |> at(1)",
        "操作 “1 // 0” 非法：除数不能为零",
      );
    });
  });

  describe("closures & captures", () => {
    tester.theyAreOk([
      ["(|$x| $x + 1).(1)", 2],
      ["(|$x, $y| $x - $y).(5, 8)", -3],
      ["10 |> (|$x| $x * 2).()", 20],
      ["10 |> &-/1.()", -10],
      ["10 |> &-/2.(20)", -10],
      ["(&*/2).(3, 4)", 12],
      ["(&^/2).(2, 10)", 1024], // alias in capture position
      ["(|$x| (|$y| $x + $y).(2)).(1)", 3], // nested lexical scoping
      ["(|$x| (|$x| $x * 2).(3) + $x).(1)", 7], // shadowing
      ["(|_, $x| $x).(1, 2)", 2], // ignored parameter
      ["(|_, _| 42).(1, 2)", 42], // ignored parameters are repeatable
    ] as [string, I.JSValue][]);

    it("reports arity errors", () => {
      tester.assertExecutionRuntimeError(
        "(|$x, $y| $x).(1)",
        "尝试调用的闭包期待 2 个参数，实际有 1 个参数",
      );
      tester.assertExecutionRuntimeError(
        "1.(2)",
        "尝试调用不可被调用的值",
      );
    });

    it("rejects duplicate parameters at compile time", () => {
      tester.assertExecutionRuntimeError(
        "(|$x, $x| 1).(1, 2)",
        "匿名函数存在重复的参数名 $x",
      );
    });
  });

  describe("pipes & repetition", () => {
    tester.theyAreOk([
      ["[2, 3, 1] |> sort", [1, 2, 3]],
      ["[2, 3, 1] |> sort()", [1, 2, 3]],
      ["3#10", [10, 10, 10]],
      ["10#([1] |> at(0))", Array(10).fill(1)],
      ["10#true |> count(&not/1)", 0],
      ["0#d6", []],
    ] as [string, I.JSValue][]);

    it("rejects a non-integer repetition count", () => {
      tester.assertExecutionRuntimeError(
        "true#1",
        "反复次数期待「整数」，实际类型为「布尔」",
      );
    });
  });

  describe("memoization & re-evaluation semantics", () => {
    const DIE = "d1_000_000_000";

    it("named bindings are pinned", () => {
      const longListOfXs = "[" + Array(100).fill("$x").join(", ") + "]";
      const result = tester.assertExecutionOk(
        `${DIE} |> (|$x| ${longListOfXs}).()`,
        undefined,
      ) as number[];
      expect(new Set(result).size).toBe(1);
    });

    it("# re-evaluates its body per iteration", () => {
      const result = tester.assertExecutionOk(`100#${DIE}`, undefined) as number[];
      expect(new Set(result).size).toBeGreaterThan(1);
    });

    it("closure calls re-evaluate their arguments", () => {
      const result = tester.assertExecutionOk(
        `100#(|$x| $x).(${DIE})`,
        undefined,
      ) as number[];
      expect(new Set(result).size).toBeGreaterThan(1);
    });
  });

  describe("compile-time errors (divergence: naive reports them lazily)", () => {
    it("rejects unknown variables", () => {
      const result = tester.evaluate("[foo, 1] |> at(0)");
      expect(result[0]).toBe("error");
      if (result[0] === "error") {
        expect(result[2].message).toBe("名为 `foo` 的变量并不存在");
      }
    });
    it("rejects unknown functions", () => {
      const result = tester.evaluate("nosuch(1)");
      expect(result[0]).toBe("error");
      if (result[0] === "error") {
        expect(result[2].message).toBe("名为 `nosuch/1` 的通常函数并不存在");
      }
    });
  });

  describe("parse errors", () => {
    it("suggests // for /", () => {
      const result = tester.evaluate("1 / 2");
      expect(result[0]).toBe("error");
      if (result[0] === "error") {
        expect(result[2].message).toContain("//");
      }
    });
    it("rejects out-of-range integer literals", () => {
      const result = tester.evaluate("9007199254740992");
      expect(result[0]).toBe("error");
      if (result[0] === "error") {
        expect(result[2].message).toBe(
          "整数字面量 9007199254740992 在整数的安全范围（-9007199254740991 至 9007199254740991）之外",
        );
      }
    });
  });

  describe("final result constraints", () => {
    it("rejects a callable final result", () => {
      tester.assertExecutionRuntimeError(
        "(|$x| $x)",
        "「可调用的」不能作为最终结果",
      );
    });
  });

  describe("makeEvaluationGenerator", () => {
    const evaluator = createEvaluatorSync(assets);

    it("yields seeded evaluations", () => {
      const gen = evaluator.makeEvaluationGenerator("3d6", {});
      expect(gen[0]).toBe("ok");
      if (gen[0] !== "ok") return;
      const first = gen[1].next();
      expect(first.done).toBe(false);
      if (!first.done) expect(first.value[0]).toBe("ok");
    });
    it("reports parse errors", () => {
      const gen = evaluator.makeEvaluationGenerator("1 +", {});
      expect(gen[0]).toBe("error");
    });
  });
});
