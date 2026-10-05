import { describe } from "vitest";

import type { SuiteContext } from "./context";
import { theyAreOk } from "./rows";

/**
 * The base functions suite, extracted from
 * `packages/naive-evaluator-builtins/test/base-functions.test.ts`.
 *
 * Each block declares the builtin names its rows need; the context's
 * `makeTesterFor` builds a tester whose scope resolves them (naive builds
 * a minimal scope; nova links all builtins and returns its default
 * tester).
 */
export function defineBaseFunctionsSuite(ctx: SuiteContext): void {
  describe("base/functions", () => {
    describe("掷骰", () => {
      describe("reroll/2", () => {
        const tester = ctx.makeTesterFor([
          "reroll/2",
          "d/2",
          "<=/2",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`10d6 |> reroll(|$x| $x <= 5)`, 60],
          ]);
        });
      });
      describe.todo("explode/2");
    });
    describe("实用", () => {
      describe("count/2", () => {
        const tester = ctx.makeTesterFor([
          "count/2",
          ">=/2",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`count([], |_| true)`, 0],
            [String.raw`count([1, 2, 3], |$x| $x >= 2)`, 2],
          ]);
        });
      });
      describe("sum/1", () => {
        const tester = ctx.makeTesterFor([
          "sum/1",
          "-/1",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`sum([10, -200, 3000])`, 2810],
          ]);
        });
      });
      describe("product/1", () => {
        const tester = ctx.makeTesterFor([
          "product/1",
          "-/1",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`product([10, -20, 30])`, -6000],
          ]);
        });
      });
      describe("any?/1", () => {
        const tester = ctx.makeTesterFor([
          "any?/1",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`any?([])`, false],
            [String.raw`any?([false])`, false],
            [String.raw`any?([false, true])`, true],
          ]);
        });
      });
      describe("sort/1", () => {
        const tester = ctx.makeTesterFor([
          "sort/1",
          "-/1",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`sort([])`, []],
            [String.raw`sort([1, -2, 3])`, [-2, 1, 3]],
          ]);
        });
      });
      describe("append/1", () => {
        const tester = ctx.makeTesterFor([
          "append/2",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`append([], 1)`, [1]],
            [String.raw`append([1], 2)`, [1, 2]],
            [String.raw`append([1], [true])`, [1, [true]]],
          ]);
        });
      });
      describe("at/1", () => {
        const tester = ctx.makeTesterFor([
          "at/2",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`at([10, 20, 30], 1)`, 20],
          ]);
        });
      });
    });
    describe("函数式", () => {
      describe("map/2", () => {
        const tester = ctx.makeTesterFor([
          "map/2",
          "*/2",
        ]);
        describe("正确使用时", () => {
          theyAreOk(ctx, tester, [
            [String.raw`map([], || 0)`, []],
            [String.raw`map([1, 2, 3], |$x| $x * $x)`, [1, 4, 9]],
          ]);
        });
      });
    });
    describe("filter/2", () => {
      const tester = ctx.makeTesterFor([
        "filter/2",
        "-/1",
        ">=/2",
      ]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`filter([], || 0)`, []],
          [String.raw`filter([1, -2, 3, -4], |$x| $x >= 0)`, [1, 3]],
        ]);
      });
    });
    describe("head/1", () => {
      const tester = ctx.makeTesterFor([
        "head/1",
      ]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`head([1, 2, 3])`, 1],
        ]);
      });
    });
    describe("tail/1", () => {
      const tester = ctx.makeTesterFor([
        "tail/1",
      ]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`tail([1, 2, 3])`, [2, 3]],
        ]);
      });
    });
    describe("zip/2", () => {
      const tester = ctx.makeTesterFor([
        "zip/2",
      ]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [String.raw`zip([1, 2, 3], [4, 5, 6])`, [[1, 4], [2, 5], [3, 6]]],
          [String.raw`zip([1, 2, 3], [4])`, [[1, 4]]],
          [String.raw`zip([1], [4, 5, 6])`, [[1, 4]]],
        ]);
      });
    });
    describe("zipWith/3", () => {
      const tester = ctx.makeTesterFor([
        "zipWith/3",
        "*/2",
      ]);
      describe("正确使用时", () => {
        theyAreOk(ctx, tester, [
          [
            String.raw`zipWith([1, 2, 3], [4, 5, 6], |$a, $b| $a * $b)`,
            [4, 10, 18],
          ],
          [String.raw`zipWith([1, 2, 3], [4], |$a, $b| $a * $b)`, [4]],
          [String.raw`zipWith([1], [4, 5, 6], |$a, $b| $a * $b)`, [4]],
        ]);
      });
    });
  });
}
