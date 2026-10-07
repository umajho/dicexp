import { describe, it } from "vitest";

import type * as I from "@dicexp/interface";

import type { SuiteContext } from "./context";
import { theyAreOk } from "./rows";

/**
 * The base functions suite, extracted from
 * `packages/naive-evaluator-builtins/test/base-functions.test.ts`, plus the
 * v0.7 builtins (`nova/docs/v0.7-contracts.md`; their per-impl behavior
 * under naive additionally lives in that package's
 * `test/v0.7-functions.test.ts`, and the div1-sensitive `all?/1` shapes in
 * the differential suite).
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
      describe("count/1", () => {
        const tester = ctx.makeTesterFor(["count/1", "///2"]);
        describe("正确使用时", () => {
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`count([])`, 0],
            [String.raw`count([1, 2, 3])`, 3],
            // 不求值元素即可取得长度：
            [String.raw`count([1 // 0, 2])`, 2],
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
      describe("abs/1", () => {
        const tester = ctx.makeTesterFor(["abs/1", "-/1"]);
        describe("正确使用时", () => {
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`abs(0)`, 0],
            [String.raw`abs(5)`, 5],
            [String.raw`abs(-5)`, 5],
            [String.raw`abs(-9007199254740991)`, 9007199254740991],
          ]);
        });
      });
      describe("has?/2", () => {
        const tester = ctx.makeTesterFor(["has?/2", "d/1", "///2"]);
        describe("正确使用时", () => {
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`has?([], 1)`, false],
            [String.raw`has?([1, 2, 3], 2)`, true],
            [String.raw`has?([1, 2, 3], 4)`, false],
            [String.raw`has?([true, false], false)`, true],
            // 标量间的跨类型只是不相等（而非报错）：
            [String.raw`has?([true], 1)`, false],
            [String.raw`has?([1, 2], true)`, false],
            // 首个匹配即短路，其后的元素不被求值：
            [String.raw`has?([1, 1 // 0], 1)`, true],
            // sequence$sum 元素经隐式转换后参与比较：
            [String.raw`has?([d1], 1)`, true],
          ]);
        });
        describe("存在非「整数或布尔」项时报错", () => {
          it(`case 1: ${String.raw`has?([[1]], 1)`}`, () => {
            tester.assertExecutionRuntimeError(
              String.raw`has?([[1]], 1)`,
              "传入的列表存在非「整数或布尔」项",
            );
          });
        });
      });
      describe("min/1 与 max/1", () => {
        const tester = ctx.makeTesterFor([
          "min/1",
          "max/1",
          "#/2",
          "d/1",
          "-/1",
        ]);
        describe("正确使用时", () => {
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`min([3, 1, 2])`, 1],
            [String.raw`max([3, -1, 2])`, 3],
            [String.raw`min([5])`, 5],
            [String.raw`max([5])`, 5],
            // sequence$sum 实参经隐式转换：
            [String.raw`min(3#d1)`, 1],
            [String.raw`max(3#d1)`, 1],
          ]);
        });
        describe("空列表报错", () => {
          it("case 1: min([])", () => {
            tester.assertExecutionRuntimeError("min([])", "列表为空");
          });
          it("case 2: max([])", () => {
            tester.assertExecutionRuntimeError("max([])", "列表为空");
          });
        });
        describe("非整数元素报错", () => {
          it(`case 1: ${String.raw`min([true])`}`, () => {
            tester.assertExecutionRuntimeError(
              "min([true])",
              "传入的列表存在非「数字」项",
            );
          });
          it(`case 2: ${String.raw`max([1, true])`}`, () => {
            tester.assertExecutionRuntimeError(
              "max([1, true])",
              "传入的列表存在非「数字」项",
            );
          });
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
      describe("all?/1", () => {
        const tester = ctx.makeTesterFor(["all?/1"]);
        describe("正确使用时", () => {
          // 与求值时机相关的形状（div1，compat.md §1：nova 在首个「假」处
          // 短路，naive 急切求值）只进差异测试——这里只放两个实现一致的行。
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`all?([])`, true],
            [String.raw`all?([true])`, true],
            [String.raw`all?([true, true])`, true],
            [String.raw`all?([true, false])`, false],
            // 嵌套列表（naive 的 flattenListAll 已在 v0.7 修复，
            // compat.md §9 的相应条目已撤销）：
            [String.raw`all?([[true], [false, true]])`, false],
            [String.raw`all?([[[true]]])`, true],
          ]);
        });
        describe("非布尔元素报错", () => {
          it("case 1: all?([1])", () => {
            tester.assertExecutionRuntimeError(
              "all?([1])",
              "传入的列表存在非「布尔」项",
            );
          });
          it("case 2: all?([[true], 1])", () => {
            tester.assertExecutionRuntimeError(
              "all?([[true], 1])",
              "传入的列表存在非「布尔」项",
            );
          });
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
      describe("sort/2", () => {
        const tester = ctx.makeTesterFor([
          "sort/2",
          "at/2",
          "count/1",
          "<=/2",
          ">=/2",
          "+/2",
          "///2",
        ]);
        describe("正确使用时", () => {
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`sort([], |$a, $b| $a <= $b)`, []],
            [String.raw`sort([3, 1, 2], |$a, $b| $a <= $b)`, [1, 2, 3]],
            [String.raw`sort([3, 1, 2], |$a, $b| $a >= $b)`, [3, 2, 1]],
            [String.raw`sort([5], |$a, $b| $a <= $b)`, [5]],
            // 布尔之间也可以排序（同 sort/1）：
            [
              String.raw`sort([true, false], |$a, $b| $a <= $b)`,
              [false, true],
            ],
            // 稳定排序：比较键相同时保持原有相对顺序。
            [
              String.raw`sort([[1, 2], [1, 1]], |$a, $b| at($a, 0) <= at($b, 0))`,
              [[1, 2], [1, 1]],
            ],
            // 元素以未求值状态传给比较操作：
            [String.raw`count(sort([1 // 0, 2], |$a, $b| true))`, 2],
          ]);
        });
        describe("比较操作返回非布尔值报错", () => {
          it(`case 1: ${String.raw`sort([2, 1], |$a, $b| $a + $b)`}`, () => {
            tester.assertExecutionRuntimeError(
              String.raw`sort([2, 1], |$a, $b| $a + $b)`,
              "作为第 2 个参数传入通常函数 sort/2 的返回值类型与期待不符：" +
                "期待「布尔」，实际「整数」。",
            );
          });
        });
        describe("比较操作出错则中止排序", () => {
          it(`case 1: ${String.raw`sort([2, 1], |$a, $b| 1 // 0)`}`, () => {
            tester.assertExecutionRuntimeError(
              String.raw`sort([2, 1], |$a, $b| 1 // 0)`,
              "操作 “1 // 0” 非法：除数不能为零",
            );
          });
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
      describe("flatMap/2", () => {
        const tester = ctx.makeTesterFor([
          "flatMap/2",
          "count/1",
          "drop/2",
          "d/1",
          "d/2",
          "///2",
        ]);
        describe("正确使用时", () => {
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`flatMap([], |$x| [$x])`, []],
            [String.raw`flatMap([1, 2], |$x| [$x, $x])`, [1, 1, 2, 2]],
            [String.raw`flatMap([1, 2], |$x| [])`, []],
            // 只展开一层：
            [String.raw`flatMap([1], |$x| [[], [$x]])`, [[], [1]]],
            // 普通序列的闭包结果隐式转换为列表：
            [String.raw`flatMap([1], |$x| drop(3d1, 1))`, [1, 1]],
            // 内部元素保持未求值：
            [String.raw`count(flatMap([1], |$x| [1 // 0, $x]))`, 2],
          ]);
        });
        describe("闭包结果经隐式转换后仍非列表时报错", () => {
          it(`case 1: ${String.raw`flatMap([1], |$x| $x)`}`, () => {
            tester.assertExecutionRuntimeError(
              String.raw`flatMap([1], |$x| $x)`,
              "作为第 2 个参数传入通常函数 flatMap/2 的返回值类型与期待不符：" +
                "期待「列表」，实际「整数」。",
            );
          });
          // sequence$sum 隐式转换为整数——仍是错误的类型：
          it(`case 2: ${String.raw`flatMap([1], |$x| d6)`}`, () => {
            tester.assertExecutionRuntimeError(
              String.raw`flatMap([1], |$x| d6)`,
              "作为第 2 个参数传入通常函数 flatMap/2 的返回值类型与期待不符：" +
                "期待「列表」，实际「整数」。",
            );
          });
        });
        describe("闭包出错则整体出错", () => {
          it(`case 1: ${String.raw`flatMap([1, 2], |$x| 1 // 0)`}`, () => {
            tester.assertExecutionRuntimeError(
              String.raw`flatMap([1, 2], |$x| 1 // 0)`,
              "操作 “1 // 0” 非法：除数不能为零",
            );
          });
        });
      });
      describe("foldl/3", () => {
        const tester = ctx.makeTesterFor([
          "foldl/3",
          "count/1",
          "+/2",
          "-/2",
          "///2",
        ]);
        describe("正确使用时", () => {
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`foldl([], 5, |$acc, $e| $acc)`, 5],
            [String.raw`foldl([1, 2, 3], 0, |$acc, $e| $acc + $e)`, 6],
            [String.raw`foldl([1, 2], 10, |$acc, $e| $acc - $e)`, 7],
            [String.raw`foldl([1, 2, 3], 0, |$acc, $e| $e)`, 3],
            // 空列表直接返回初始值（返回时才求值）：
            [String.raw`count([foldl([], 1 // 0, |$acc, $e| 0)])`, 1],
          ]);
        });
        describe("出错即停止", () => {
          it(
            `case 1: ${String.raw`foldl([1, 1 // 0, 3], 0, |$acc, $e| $acc + $e)`}`,
            () => {
              tester.assertExecutionRuntimeError(
                String.raw`foldl([1, 1 // 0, 3], 0, |$acc, $e| $acc + $e)`,
                "操作 “1 // 0” 非法：除数不能为零",
              );
            },
          );
        });
      });
      describe("foldr/3", () => {
        const tester = ctx.makeTesterFor(["foldr/3", "+/2", "-/2", "///2"]);
        describe("正确使用时", () => {
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`foldr([], 5, |$e, $acc| $acc)`, 5],
            [String.raw`foldr([1, 2, 3], 0, |$e, $acc| $e + $acc)`, 6],
            // 自右向左：1 - (2 - 0) = -1
            [String.raw`foldr([1, 2], 0, |$e, $acc| $e - $acc)`, -1],
            // 累积值不被 foldr 强制求值（由闭包决定）：
            [String.raw`foldr([1, 2], 1 // 0, |$e, $acc| $e)`, 1],
          ]);
        });
      });
      describe("unfold/2 与 iterate/2", () => {
        const tester = ctx.makeTesterFor([
          "unfold/2",
          "iterate/2",
          "take/2",
          "drop/2",
          "count/1",
          "sum/1",
          "head/1",
          "append/2",
          "filter/2",
          "at/2",
          "+/2",
          "-/2",
          ">/2",
          "///2",
        ]);
        describe("正确使用时", () => {
          // 两者都是（可能无限的）序列，必须经 take/drop 消费；转换为
          // 无限序列的列表是无界形状，套件从不生成（见契约文档）。
          theyAreOk<I.JSValue>(ctx, tester, [
            [String.raw`iterate(1, |$x| $x + 1) |> take(5)`, [1, 2, 3, 4, 5]],
            [String.raw`iterate(1, |$x| $x + 1) |> take(0)`, []],
            [String.raw`sum(iterate(1, |$x| $x + 1) |> take(3))`, 6],
            [String.raw`iterate(1, |$x| $x + 1) |> drop(2) |> take(2)`, [3, 4]],
            [String.raw`unfold(3, |$n| [$n, $n - 1]) |> take(3)`, [3, 2, 1]],
            // 步骤返回「假」则序列结束（模拟 if，无末尾 `.()`——单纯的值
            // 并不可调用）：
            [
              String
                .raw`unfold(3, |$x| head(append(filter([[$x, $x - 1]], |_| $x > 0), false))) |> take(5)`,
              [3, 2, 1],
            ],
            [
              String
                .raw`unfold([0, 1], |$p| [at($p, 0), [at($p, 1), at($p, 0) + at($p, 1)]]) |> take(5)`,
              [0, 1, 1, 2, 3],
            ],
            // 产出的元素不被求值：
            [String.raw`count(unfold(1, |$x| [1 // 0, false]) |> take(1))`, 1],
            // 无拉取（`take 0`）则种子也不被求值：
            [String.raw`unfold(1 // 0, |$x| false) |> take(0)`, []],
          ]);
        });
        describe("首个种子在首次拉取时被求值", () => {
          it(
            `case 1: ${String.raw`unfold(1 // 0, |$x| false) |> take(1)`}`,
            () => {
              tester.assertExecutionRuntimeError(
                String.raw`unfold(1 // 0, |$x| false) |> take(1)`,
                "操作 “1 // 0” 非法：除数不能为零",
              );
            },
          );
        });
        describe("步骤返回值类型不符报错", () => {
          it(`case 1: ${String.raw`unfold(1, |$x| 42) |> take(3)`}`, () => {
            tester.assertExecutionRuntimeError(
              String.raw`unfold(1, |$x| 42) |> take(3)`,
              "传入 unfold/2 的闭包的返回值类型与期待不符：" +
                "期待「布尔」或含两个元素的列表，实际「整数」。",
            );
          });
        });
        describe("步骤列表长度不符报错", () => {
          it(
            `case 1: ${String.raw`unfold(1, |$x| [1, 2, 3]) |> take(3)`}`,
            () => {
              tester.assertExecutionRuntimeError(
                String.raw`unfold(1, |$x| [1, 2, 3]) |> take(3)`,
                "传入 unfold/2 的闭包返回的列表应含两个元素，实际含 3 个。",
              );
            },
          );
        });
        describe("闭包出错时以终止错误元素结束", () => {
          it(
            `case 1: ${String.raw`unfold(1, |$x| 1 // 0) |> take(1)`}`,
            () => {
              tester.assertExecutionRuntimeError(
                String.raw`unfold(1, |$x| 1 // 0) |> take(1)`,
                "操作 “1 // 0” 非法：除数不能为零",
              );
            },
          );
          it(
            `case 2: ${String.raw`iterate(1, |$x| 1 // 0) |> take(2)`}`,
            () => {
              tester.assertExecutionRuntimeError(
                String.raw`iterate(1, |$x| 1 // 0) |> take(2)`,
                "操作 “1 // 0” 非法：除数不能为零",
              );
            },
          );
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
    describe("last/1 与 init/1", () => {
      const tester = ctx.makeTesterFor(["last/1", "init/1", "///2"]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`last([1, 2, 3])`, 3],
          [String.raw`last([5])`, 5],
          [String.raw`init([1, 2, 3])`, [1, 2]],
          [String.raw`init([5])`, []],
          // 元素保持未求值：
          [String.raw`last([1 // 0, 2])`, 2],
          [String.raw`last(init([1, 1 // 0]))`, 1],
        ]);
      });
      describe("空列表报错", () => {
        it("case 1: last([])", () => {
          tester.assertExecutionRuntimeError("last([])", "列表为空");
        });
        it("case 2: init([])", () => {
          tester.assertExecutionRuntimeError("init([])", "列表为空");
        });
      });
    });
    describe("take/2 与 drop/2", () => {
      const tester = ctx.makeTesterFor([
        "take/2",
        "drop/2",
        "count/1",
        "#/2",
        "d/1",
        "d/2",
        "-/1",
      ]);
      describe("列表", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`take([1, 2, 3], 2)`, [1, 2]],
          [String.raw`take([1], 5)`, [1]],
          [String.raw`take([], 2)`, []],
          [String.raw`take([1, 2], 0)`, []],
          [String.raw`take([1, 2], -1)`, []],
          [String.raw`drop([1, 2, 3], 1)`, [2, 3]],
          [String.raw`drop([1, 2, 3], 5)`, []],
          [String.raw`drop([], 3)`, []],
          [String.raw`drop([1, 2], 0)`, [1, 2]],
          [String.raw`drop([1, 2], -1)`, [1, 2]],
        ]);
      });
      describe("序列（按实际位置拉取，越过名义结束位置）", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`take(d1, 3)`, [1, 1, 1]],
          [String.raw`take(3d1, 2)`, [1, 1]],
          [String.raw`take(3#d1, 2)`, [1, 1]],
          // drop 返回新的普通序列，懒惰地跳过：
          [String.raw`drop(3d1, 1)`, [1, 1]],
          [String.raw`drop(d1, 0) |> take(2)`, [1, 1]],
          [String.raw`take(drop(5#d1, 2), 2)`, [1, 1]],
          // n ≤ 0 时不拉取任何项：
          [String.raw`take(3#d6, 0)`, []],
          [String.raw`take(d6, -1)`, []],
          // 构造时不拉取，被拉取时才跳过：
          [String.raw`count([drop(d6, 1)])`, 1],
        ]);
      });
    });
    describe("takeWhile/2 与 dropWhile/2", () => {
      const tester = ctx.makeTesterFor([
        "takeWhile/2",
        "dropWhile/2",
        "count/1",
        "</2",
        ">/2",
        "///2",
      ]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`takeWhile([], |$x| true)`, []],
          [String.raw`takeWhile([1, 2, 3], |$x| $x < 3)`, [1, 2]],
          [String.raw`takeWhile([1, 2, 3], |$x| true)`, [1, 2, 3]],
          [String.raw`takeWhile([2, 1], |$x| $x < 2)`, []],
          [String.raw`dropWhile([], |$x| true)`, []],
          [String.raw`dropWhile([1, 2, 3], |$x| $x < 3)`, [3]],
          [String.raw`dropWhile([1, 2, 3], |$x| true)`, []],
          [String.raw`dropWhile([1, 2, 3], |$x| false)`, [1, 2, 3]],
        ]);
      });
      describe("遇到首个「假」即停止，其后元素不被触碰", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`takeWhile([1, 3, 1 // 0], |$x| $x < 2)`, [1]],
          [String.raw`takeWhile([0, 1 // 0], |$x| $x > 0)`, []],
          // 停止后的剩余元素不再被谓词触碰：
          [String.raw`count(dropWhile([1, 3, 1 // 0], |$x| $x < 2))`, 2],
        ]);
      });
      describe("谓词返回非布尔值报错", () => {
        it(`case 1: ${String.raw`takeWhile([1], |$x| $x)`}`, () => {
          tester.assertExecutionRuntimeError(
            String.raw`takeWhile([1], |$x| $x)`,
            "作为第 2 个参数传入通常函数 takeWhile/2 的返回值类型与期待不符：" +
              "期待「布尔」，实际「整数」。",
          );
        });
        it(`case 2: ${String.raw`dropWhile([1], |$x| $x)`}`, () => {
          tester.assertExecutionRuntimeError(
            String.raw`dropWhile([1], |$x| $x)`,
            "作为第 2 个参数传入通常函数 dropWhile/2 的返回值类型与期待不符：" +
              "期待「布尔」，实际「整数」。",
          );
        });
      });
      describe("谓词出错则整体出错", () => {
        it(`case 1: ${String.raw`takeWhile([1, 2], |$x| 1 // 0)`}`, () => {
          tester.assertExecutionRuntimeError(
            String.raw`takeWhile([1, 2], |$x| 1 // 0)`,
            "操作 “1 // 0” 非法：除数不能为零",
          );
        });
        it(`case 2: ${String.raw`dropWhile([1], |$x| 1 // 0)`}`, () => {
          tester.assertExecutionRuntimeError(
            String.raw`dropWhile([1], |$x| 1 // 0)`,
            "操作 “1 // 0” 非法：除数不能为零",
          );
        });
      });
    });
    describe("reverse/1", () => {
      const tester = ctx.makeTesterFor(["reverse/1", "head/1", "///2"]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`reverse([])`, []],
          [String.raw`reverse([1])`, [1]],
          [String.raw`reverse([1, 2, 3])`, [3, 2, 1]],
          // 句柄倒置，元素保持未求值：
          [String.raw`head(reverse([1 // 0, 2]))`, 2],
        ]);
      });
    });
    describe("concat/2", () => {
      const tester = ctx.makeTesterFor(["concat/2"]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`concat([], [])`, []],
          [String.raw`concat([], [1])`, [1]],
          [String.raw`concat([1], [])`, [1]],
          [String.raw`concat([1], [2, 3])`, [1, 2, 3]],
        ]);
      });
    });
    describe("prepend/2", () => {
      const tester = ctx.makeTesterFor(["prepend/2", "at/2", "///2"]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`prepend([], 1)`, [1]],
          [String.raw`prepend([2, 3], 1)`, [1, 2, 3]],
          [String.raw`prepend([1], [true])`, [[true], 1]],
          // 被前插的元素保持未求值（取位置 1 不触碰它）：
          [String.raw`at(prepend([1], 1 // 0), 1)`, 1],
        ]);
      });
    });
    describe("at/3", () => {
      const tester = ctx.makeTesterFor(["at/3", "-/1", "///2"]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`at([10, 20], 0, 0)`, 10],
          [String.raw`at([10, 20], 1, 0)`, 20],
          // 越界（或负索引）不报错，改取默认值：
          [String.raw`at([10, 20], 5, 7)`, 7],
          [String.raw`at([10, 20], -1, 7)`, 7],
          [String.raw`at([], 0, 7)`, 7],
          // 界内时默认值不被求值（错误规避形式）：
          [String.raw`at([1], 0, 1 // 0)`, 1],
        ]);
      });
      describe("越界时才求值默认值", () => {
        it(`case 1: ${String.raw`at([1], 5, 1 // 0)`}`, () => {
          tester.assertExecutionRuntimeError(
            String.raw`at([1], 5, 1 // 0)`,
            "操作 “1 // 0” 非法：除数不能为零",
          );
        });
      });
    });
    describe("duplicate/2", () => {
      const tester = ctx.makeTesterFor([
        "duplicate/2",
        "count/1",
        "all?/1",
        "map/2",
        "head/1",
        "==/2",
        "d/1",
        "-/1",
        "///2",
      ]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`duplicate(1, 3)`, [1, 1, 1]],
          [String.raw`duplicate(true, 2)`, [true, true]],
          [String.raw`duplicate(1, 0)`, []],
          [String.raw`duplicate(1, -2)`, []],
          // 各元素是同一个未求值的值盒：
          [String.raw`count(duplicate(1 // 0, 2))`, 2],
          // 值被固定：`d` 只求值一次，故各元素必相等（与 `#` 的逐次
          // 重新求值相对；随机的对齐由差异测试按种子固定）：
          [
            String
              .raw`(|$l| all?(map($l, |$e| $e == head($l)))).(duplicate(d1_000_000, 3))`,
            true,
          ],
        ]);
      });
      describe("结果列表被求值时其中的共享值盒才被求值", () => {
        it(`case 1: ${String.raw`duplicate(1 // 0, 2)`}`, () => {
          tester.assertExecutionRuntimeError(
            String.raw`duplicate(1 // 0, 2)`,
            "操作 “1 // 0” 非法：除数不能为零",
          );
        });
      });
    });
    describe("flatten/2", () => {
      const tester = ctx.makeTesterFor([
        "flatten/2",
        "count/1",
        "d/1",
        "-/1",
        "///2",
      ]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`flatten([], 0)`, []],
          // 深度为 0（或负）时浅层复制：
          [String.raw`flatten([1, [2]], 0)`, [1, [2]]],
          [String.raw`flatten([1, [2], [[3]]], -1)`, [1, [2], [[3]]]],
          [String.raw`flatten([1, [2, [3]]], 1)`, [1, 2, [3]]],
          [String.raw`flatten([1, [2, [3]]], 2)`, [1, 2, 3]],
          [String.raw`flatten([[[1]]], 1)`, [[1]]],
          [String.raw`flatten([1, [2], [[3]]], 5)`, [1, 2, 3]],
          // 界限上的元素不被求值（错误规避形式）：
          [String.raw`count(flatten([[1 // 0]], 1))`, 1],
          [String.raw`count(flatten([[d6]], 1))`, 1],
          // sequence$sum 元素隐式转换为「和」——一个叶子：
          [String.raw`flatten([d1], 1)`, [1]],
        ]);
      });
      describe("界限之上的元素被求值以测试列表性", () => {
        it(`case 1: ${String.raw`flatten([[1 // 0]], 2)`}`, () => {
          tester.assertExecutionRuntimeError(
            String.raw`flatten([[1 // 0]], 2)`,
            "操作 “1 // 0” 非法：除数不能为零",
          );
        });
      });
    });
    describe("flattenAll/1", () => {
      const tester = ctx.makeTesterFor(["flattenAll/1", "///2"]);
      describe("正确使用时", () => {
        theyAreOk<I.JSValue>(ctx, tester, [
          [String.raw`flattenAll([])`, []],
          [String.raw`flattenAll([1])`, [1]],
          [String.raw`flattenAll([1, [2, [3, [[4]]]]])`, [1, 2, 3, 4]],
          [String.raw`flattenAll([1, [true]])`, [1, true]],
        ]);
      });
      describe("所有元素最终都被求值", () => {
        it(`case 1: ${String.raw`flattenAll([[1 // 0]])`}`, () => {
          tester.assertExecutionRuntimeError(
            String.raw`flattenAll([[1 // 0]])`,
            "操作 “1 // 0” 非法：除数不能为零",
          );
        });
      });
    });
  });
}
