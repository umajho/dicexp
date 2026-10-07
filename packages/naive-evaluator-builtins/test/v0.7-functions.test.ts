import { describe, it } from "vitest";
import { assert } from "vitest";

import { makeTesterFor } from "./utils";

/**
 * v0.7 新增内置函数（`nova/docs/v0.7-contracts.md`）在 naive 下的行为测试。
 * 仅针对 naive（另一实现的共享套件行由共享套件与差异测试负责）。
 */

const tester = makeTesterFor([
  "abs/1",
  "count/1",
  "count/2",
  "has?/2",
  "sum/1",
  "min/1",
  "max/1",
  "all?/1",
  "any?/1",
  "sort/2",
  "reverse/1",
  "concat/2",
  "prepend/2",
  "append/2",
  "at/2",
  "at/3",
  "head/1",
  "tail/1",
  "last/1",
  "init/1",
  "duplicate/2",
  "flatten/2",
  "flattenAll/1",
  "map/2",
  "flatMap/2",
  "foldl/3",
  "foldr/3",
  "unfold/2",
  "iterate/2",
  "take/2",
  "takeWhile/2",
  "drop/2",
  "dropWhile/2",
  "+/2",
  "-/2",
  "-/1",
  "*/2",
  "///2",
  "#/2",
  "d/1",
  "d/2",
  "</2",
  "<=/2",
  ">/2",
  ">=/2",
]);

describe("v0.7 函数（naive）", () => {
  describe("abs/1", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("abs(0)", 0);
      tester.assertExecutionOk("abs(5)", 5);
      tester.assertExecutionOk("abs(-5)", 5);
      tester.assertExecutionOk(`abs(-9007199254740991)`, 9007199254740991);
    });
  });

  describe("count/1", () => {
    it("不求值元素", () => {
      tester.assertExecutionOk("count([])", 0);
      tester.assertExecutionOk("count([1, 2, 3])", 3);
      tester.assertExecutionOk(String.raw`count([1//0, 2])`, 2);
    });
  });

  describe("has?/2", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("has?([], 1)", false);
      tester.assertExecutionOk("has?([1, 2, 3], 2)", true);
      tester.assertExecutionOk("has?([1, 2, 3], 4)", false);
      tester.assertExecutionOk("has?([true, false], true)", true);
      tester.assertExecutionOk("has?([true, false], false)", true);
      tester.assertExecutionOk("has?([true, false], 1)", false);
      tester.assertExecutionOk("has?([1, 2], true)", false);
    });
    it("逐个求值元素（sequence$sum 元素隐式转换）", () => {
      tester.assertExecutionOk("has?([d1], 1)", true);
      tester.assertExecutionOk("has?([d1], 2)", false);
    });
    it("首个匹配即短路", () => {
      tester.assertExecutionOk(String.raw`has?([1, 1//0], 1)`, true);
    });
    it("非标量元素报错", () => {
      tester.assertExecutionRuntimeError(
        "has?([[1]], 1)",
        "传入的列表存在非「整数或布尔」项",
      );
      tester.assertExecutionRuntimeError(
        "has?([true, [|$x| $x]], 1)",
        "传入的列表存在非「整数或布尔」项",
      );
    });
  });

  describe("min/1, max/1", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("min([3, 1, 2])", 1);
      tester.assertExecutionOk("max([3, 1, 2])", 3);
      tester.assertExecutionOk("min([5])", 5);
      tester.assertExecutionOk("max([5])", 5);
      tester.assertExecutionOk("min([3, -1, 2])", -1);
      tester.assertExecutionOk("max([3, -1, 2])", 3);
    });
    it("空列表报错", () => {
      tester.assertExecutionRuntimeError("min([])", "列表为空");
      tester.assertExecutionRuntimeError("max([])", "列表为空");
    });
    it("非整数元素报错", () => {
      tester.assertExecutionRuntimeError(
        "min([true])",
        "传入的列表存在非「数字」项",
      );
      tester.assertExecutionRuntimeError(
        "max([1, true])",
        "传入的列表存在非「数字」项",
      );
    });
    it("隐式转换序列（3#d1）", () => {
      tester.assertExecutionOk("min(3#d1)", 1);
      tester.assertExecutionOk("max(3#d1)", 1);
    });
  });

  describe("all?/1", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("all?([])", true);
      tester.assertExecutionOk("all?([true])", true);
      tester.assertExecutionOk("all?([false])", false);
      tester.assertExecutionOk("all?([true, true])", true);
      tester.assertExecutionOk("all?([true, false])", false);
    });
    it("嵌套列表（修复后的 flattenListAll）", () => {
      tester.assertExecutionOk("all?([[true], [true]])", true);
      tester.assertExecutionOk("all?([[true], [false, true]])", false);
      tester.assertExecutionOk("all?([[[true]]])", true);
    });
    it("非布尔元素报错", () => {
      tester.assertExecutionRuntimeError(
        "all?([1])",
        "传入的列表存在非「布尔」项",
      );
      tester.assertExecutionRuntimeError(
        "all?([[true], 1])",
        "传入的列表存在非「布尔」项",
      );
    });
    it("naive 不短路：遇到「假」后仍会求值其余元素", () => {
      // div1（compat.md §1）：nova 在首个「假」处短路；naive 急切求值。
      tester.assertExecutionRuntimeError(
        "all?([false, 1])",
        "传入的列表存在非「布尔」项",
      );
    });
  });

  describe("any?/1（flattenListAll 修复）", () => {
    it("嵌套列表中被展开的元素不再被覆盖", () => {
      // 修复前：[[false, true], false] 展开为 [false, false]，得「假」。
      tester.assertExecutionOk("any?([[false, true], false])", true);
      tester.assertExecutionOk("any?([[false], [true]])", true);
      tester.assertExecutionOk("any?([[false], [false]])", false);
    });
  });

  describe("sort/2", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("sort([], |$a, $b| $a <= $b)", []);
      tester.assertExecutionOk(
        "sort([3, 1, 2], |$a, $b| $a <= $b)",
        [1, 2, 3],
      );
      tester.assertExecutionOk(
        "sort([3, 1, 2], |$a, $b| $a >= $b)",
        [3, 2, 1],
      );
      tester.assertExecutionOk("sort([5], |$a, $b| $a <= $b)", [5]);
    });
    it("布尔之间也可以排序", () => {
      tester.assertExecutionOk(
        "sort([true, false], |$a, $b| $a <= $b)",
        [false, true],
      );
      tester.assertExecutionOk(
        "sort([true, false], |$a, $b| $a >= $b)",
        [true, false],
      );
    });
    it("稳定排序", () => {
      // 比较键相同时保持原有相对顺序。
      tester.assertExecutionOk(
        "sort([[1, 2], [1, 1]], |$a, $b| at($a, 0) <= at($b, 0))",
        [[1, 2], [1, 1]],
      );
      tester.assertExecutionOk(
        "sort([[1, 1], [1, 2], [0, 3]], |$a, $b| at($a, 0) <= at($b, 0))",
        [[0, 3], [1, 1], [1, 2]],
      );
    });
    it("元素以未求值状态传给比较操作", () => {
      // 比较操作不触碰元素时，元素不被求值。
      tester.assertExecutionOk(
        String.raw`count(sort([1//0, 2], |$a, $b| true))`,
        2,
      );
    });
    it("比较操作返回非布尔值报错", () => {
      tester.assertExecutionRuntimeError(
        "sort([2, 1], |$a, $b| $a + $b)",
        "作为第 2 个参数传入通常函数 sort/2 的返回值类型与期待不符：" +
          "期待「布尔」，实际「整数」。",
      );
    });
    it("比较操作出错则中止排序", () => {
      tester.assertExecutionRuntimeError(
        String.raw`sort([2, 1], |$a, $b| 1//0)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });

  describe("reverse/1", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("reverse([])", []);
      tester.assertExecutionOk("reverse([1])", [1]);
      tester.assertExecutionOk("reverse([1, 2, 3])", [3, 2, 1]);
    });
    it("元素保持未求值", () => {
      tester.assertExecutionOk(String.raw`head(reverse([1//0, 2]))`, 2);
    });
  });

  describe("concat/2", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("concat([], [])", []);
      tester.assertExecutionOk("concat([], [1])", [1]);
      tester.assertExecutionOk("concat([1], [])", [1]);
      tester.assertExecutionOk("concat([1], [2, 3])", [1, 2, 3]);
    });
  });

  describe("prepend/2", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("prepend([], 1)", [1]);
      tester.assertExecutionOk("prepend([2, 3], 1)", [1, 2, 3]);
      tester.assertExecutionOk("prepend([1], [true])", [[true], 1]);
    });
    it("元素保持未求值", () => {
      // 被前插的元素在位置 0；取出位置 1 的元素不触碰它。
      tester.assertExecutionOk(String.raw`at(prepend([1], 1//0), 1)`, 1);
    });
  });

  describe("at/3", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("at([10, 20], 0, 0)", 10);
      tester.assertExecutionOk("at([10, 20], 1, 0)", 20);
      tester.assertExecutionOk("at([10, 20], 5, 7)", 7);
      tester.assertExecutionOk("at([10, 20], -1, 7)", 7);
      tester.assertExecutionOk("at([], 0, 7)", 7);
    });
    it("索引在界内时不求值默认值", () => {
      tester.assertExecutionOk("at([1], 0, d6)", 1);
    });
    it("索引越界时才求值默认值（随机数流对齐）", () => {
      const first = tester.evaluate("d6", { execution: { seed: 7 } });
      assert.ok(first[0] === "ok");
      const result = tester.evaluate("at([1], 5, d6)", {
        execution: { seed: 7 },
      });
      assert.ok(result[0] === "ok");
      assert.equal(result[1], first[1]);
    });
  });

  describe("duplicate/2", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("duplicate(1, 3)", [1, 1, 1]);
      tester.assertExecutionOk("duplicate(true, 2)", [true, true]);
      tester.assertExecutionOk("duplicate(1, 1)", [1]);
      tester.assertExecutionOk("duplicate(1, 0)", []);
      tester.assertExecutionOk("duplicate(1, -2)", []);
    });
    it("值被固定：只求值一次", () => {
      const first = tester.evaluate("d6", { execution: { seed: 42 } });
      assert.ok(first[0] === "ok");
      const sumResult = tester.evaluate("sum(duplicate(d6, 3))", {
        execution: { seed: 42 },
      });
      assert.ok(sumResult[0] === "ok");
      assert.equal(sumResult[1], 3 * (first[1] as number));
      // 对照：「#」逐次重新求值（三次投掷）。
      const triple = tester.evaluate("3#d6", { execution: { seed: 42 } });
      assert.ok(triple[0] === "ok");
      const [a, b, c] = triple[1] as number[];
      assert.notEqual(sumResult[1], a + b + c);
    });
    it("列表元素是同一个未求值的值盒", () => {
      tester.assertExecutionOk(String.raw`count(duplicate(1//0, 2))`, 2);
      tester.assertExecutionRuntimeError(
        String.raw`duplicate(1//0, 2)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });

  describe("flatten/2", () => {
    it("深度为 0 时浅层复制", () => {
      tester.assertExecutionOk("flatten([], 0)", []);
      tester.assertExecutionOk("flatten([1, [2]], 0)", [1, [2]]);
    });
    it("基本行为", () => {
      tester.assertExecutionOk("flatten([1, [2, [3]]], 1)", [1, 2, [3]]);
      tester.assertExecutionOk("flatten([1, [2, [3]]], 2)", [1, 2, 3]);
      tester.assertExecutionOk("flatten([[[1]]], 1)", [[1]]);
      tester.assertExecutionOk("flatten([[[1]]], 2)", [1]);
      tester.assertExecutionOk("flatten([1, [2], [[3]]], 5)", [1, 2, 3]);
      tester.assertExecutionOk("flatten([1, [2], [[3]]], -1)", [
        1,
        [2],
        [[3]],
      ]);
    });
    it("界限之上的元素被求值以测试列表性", () => {
      tester.assertExecutionRuntimeError(
        String.raw`flatten([[1//0]], 2)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
    it("界限之上的元素测试后保留原始值盒", () => {
      // sequence$sum 元素被隐式转换测试后，保留原始句柄。
      tester.assertExecutionOk("flatten([d1], 1)", [1]);
    });
    it("界限上的元素不求值", () => {
      tester.assertExecutionOk(String.raw`count(flatten([[1//0]], 1))`, 1);
      tester.assertExecutionOk(String.raw`count(flatten([[d6]], 1))`, 1);
    });
  });

  describe("flattenAll/1", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("flattenAll([])", []);
      tester.assertExecutionOk("flattenAll([1])", [1]);
      tester.assertExecutionOk("flattenAll([1, [2, [3, [[4]]]]])", [
        1,
        2,
        3,
        4,
      ]);
      tester.assertExecutionOk("flattenAll([[[1]]])", [1]);
      tester.assertExecutionOk("flattenAll([1, [true]])", [1, true]);
    });
    it("所有元素最终都被求值", () => {
      tester.assertExecutionRuntimeError(
        String.raw`flattenAll([[1//0]])`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });

  describe("flatMap/2", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("flatMap([], |$x| [$x])", []);
      tester.assertExecutionOk("flatMap([1, 2], |$x| [$x, $x])", [
        1,
        1,
        2,
        2,
      ]);
      tester.assertExecutionOk("flatMap([1, 2], |$x| [])", []);
      tester.assertExecutionOk("flatMap([1], |$x| [[], [[$x]]])", [
        [],
        [[1]],
      ]);
    });
    it("结果经隐式转换后须为列表", () => {
      // 普通序列（drop 3d1 的结果）隐式转换为列表。
      tester.assertExecutionOk("flatMap([1], |$x| drop(3d1, 1))", [1, 1]);
    });
    it("非列表结果报错", () => {
      tester.assertExecutionRuntimeError(
        "flatMap([1], |$x| $x)",
        "作为第 2 个参数传入通常函数 flatMap/2 的返回值类型与期待不符：" +
          "期待「列表」，实际「整数」。",
      );
      // sequence$sum 隐式转换为整数，仍是错误的类型。
      tester.assertExecutionRuntimeError(
        "flatMap([1], |$x| d6)",
        "作为第 2 个参数传入通常函数 flatMap/2 的返回值类型与期待不符：" +
          "期待「列表」，实际「整数」。",
      );
    });
    it("内部元素保持未求值", () => {
      tester.assertExecutionOk(
        String.raw`count(flatMap([1], |$x| [1//0, $x]))`,
        2,
      );
    });
    it("闭包出错则整体出错", () => {
      tester.assertExecutionRuntimeError(
        String.raw`flatMap([1, 2], |$x| 1//0)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });

  describe("foldl/3", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("foldl([], 5, |$acc, $e| $acc)", 5);
      tester.assertExecutionOk(
        "foldl([1, 2, 3], 0, |$acc, $e| $acc + $e)",
        6,
      );
      tester.assertExecutionOk("foldl([1, 2], 10, |$acc, $e| $acc - $e)", 7);
      tester.assertExecutionOk("foldl([1, 2, 3], 0, |$acc, $e| $e)", 3);
    });
    it("空列表直接返回初始值（不求值亦无妨，返回时才求值）", () => {
      tester.assertExecutionOk(
        String.raw`count([foldl([], 1//0, |$acc, $e| 0)])`,
        1,
      );
    });
    it("出错即停止", () => {
      tester.assertExecutionRuntimeError(
        String.raw`foldl([1, 1//0, 3], 0, |$acc, $e| $acc + $e)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });

  describe("foldr/3", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("foldr([], 5, |$e, $acc| $acc)", 5);
      tester.assertExecutionOk(
        "foldr([1, 2, 3], 0, |$e, $acc| $e + $acc)",
        6,
      );
      // 自右向左：1 - (2 - 0) = -1
      tester.assertExecutionOk("foldr([1, 2], 0, |$e, $acc| $e - $acc)", -1);
    });
    it("累积值不被 foldr 强制求值", () => {
      tester.assertExecutionOk(
        String.raw`foldr([1, 2], 1//0, |$e, $acc| $e)`,
        1,
      );
    });
  });

  describe("iterate/2", () => {
    it("配合 take 使用", () => {
      tester.assertExecutionOk(
        "iterate(1, |$x| $x + 1) |> take(5)",
        [1, 2, 3, 4, 5],
      );
      tester.assertExecutionOk("iterate(5, |$x| $x * 2) |> take(4)", [
        5,
        10,
        20,
        40,
      ]);
      tester.assertExecutionOk("iterate(1, |$x| $x + 1) |> take(0)", []);
      tester.assertExecutionOk("sum(iterate(1, |$x| $x + 1) |> take(3))", 6);
    });
    it("配合 drop 使用", () => {
      tester.assertExecutionOk(
        "iterate(1, |$x| $x + 1) |> drop(2) |> take(2)",
        [3, 4],
      );
    });
    it("f 出错时以终止错误元素结束", () => {
      tester.assertExecutionRuntimeError(
        String.raw`iterate(1, |$x| 1//0) |> take(2)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });

  describe("unfold/2", () => {
    it("配合 take 使用（无限流）", () => {
      tester.assertExecutionOk(
        "unfold(3, |$n| [$n, $n - 1]) |> take(3)",
        [3, 2, 1],
      );
      tester.assertExecutionOk("sum(unfold(1, |$x| [$x, 1]) |> take(4))", 4);
    });
    it("步骤返回「假」时序列结束", () => {
      tester.assertExecutionOk(
        "unfold(2, |$n| at([false, [$n, $n - 1]], count([$n], |$e| $e > 0))) |> take(5)",
        [2, 1],
      );
      // 直接转换为列表：产出恰为其各项。
      tester.assertExecutionOk(
        "unfold(2, |$n| at([false, [$n, $n - 1]], count([$n], |$e| $e > 0)))",
        [2, 1],
      );
    });
    it("斐波那契", () => {
      tester.assertExecutionOk(
        "unfold([0, 1], |$p| [at($p, 0), [at($p, 1), at($p, 0) + at($p, 1)]]) |> take(5)",
        [0, 1, 1, 2, 3],
      );
    });
    it("产出的元素不求值", () => {
      tester.assertExecutionOk(
        String.raw`count(unfold(1, |$x| [1//0, false]) |> take(1))`,
        1,
      );
    });
    it("首个种子在首次拉取时被求值", () => {
      tester.assertExecutionRuntimeError(
        String.raw`unfold(1//0, |$x| false) |> take(1)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
    it("步骤类型不符报错", () => {
      tester.assertExecutionRuntimeError(
        "unfold(1, |$x| $x) |> take(1)",
        "传入 unfold/2 的闭包的返回值类型与期待不符：" +
          "期待「布尔」或含两个元素的列表，实际「整数」。",
      );
      tester.assertExecutionRuntimeError(
        "unfold(1, |$x| true) |> take(1)",
        "传入 unfold/2 的闭包的返回值类型与期待不符：" +
          "期待「布尔」或含两个元素的列表，实际「布尔」。",
      );
    });
    it("步骤列表长度不符报错", () => {
      tester.assertExecutionRuntimeError(
        "unfold(1, |$x| [1, 2, 3]) |> take(1)",
        "传入 unfold/2 的闭包返回的列表应含两个元素，实际含 3 个。",
      );
      tester.assertExecutionRuntimeError(
        "unfold(1, |$x| []) |> take(1)",
        "传入 unfold/2 的闭包返回的列表应含两个元素，实际含 0 个。",
      );
    });
    it("闭包出错时以终止错误元素结束", () => {
      tester.assertExecutionRuntimeError(
        String.raw`unfold(1, |$x| 1//0) |> take(1)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });

  describe("last/1, init/1", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("last([1, 2, 3])", 3);
      tester.assertExecutionOk("last([5])", 5);
      tester.assertExecutionOk("init([1, 2, 3])", [1, 2]);
      tester.assertExecutionOk("init([5])", []);
    });
    it("空列表报错", () => {
      tester.assertExecutionRuntimeError("last([])", "列表为空");
      tester.assertExecutionRuntimeError("init([])", "列表为空");
    });
    it("元素保持未求值", () => {
      tester.assertExecutionOk(String.raw`last([1//0, 2])`, 2);
      tester.assertExecutionOk(String.raw`last(init([1, 1//0]))`, 1);
    });
  });

  describe("take/2", () => {
    it("列表", () => {
      tester.assertExecutionOk("take([1, 2, 3], 2)", [1, 2]);
      tester.assertExecutionOk("take([1], 5)", [1]);
      tester.assertExecutionOk("take([], 2)", []);
      tester.assertExecutionOk("take([1, 2], 0)", []);
      tester.assertExecutionOk("take([1, 2], -1)", []);
    });
    it("n ≤ 0 时不消耗随机数", () => {
      tester.assertExecutionOk("take(3#d6, 0)", []);
      tester.assertExecutionOk("take(3#d6, -1)", []);
      tester.assertExecutionOk("take(d6, 0)", []);
      tester.assertExecutionOk("take(d6, -1)", []);
    });
    it("序列：拉取实际位置（越过名义结束位置）", () => {
      // d1 名义长度为 1；take 3 拉取 3 个实际位置。
      tester.assertExecutionOk("take(d1, 3)", [1, 1, 1]);
      tester.assertExecutionOk("take(3d1, 2)", [1, 1]);
      tester.assertExecutionOk("take(3#d1, 2)", [1, 1]);
      tester.assertExecutionOk("count(take(d6, 3))", 3);
    });
  });

  describe("takeWhile/2", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("takeWhile([], |$x| true)", []);
      tester.assertExecutionOk("takeWhile([1, 2, 3], |$x| $x < 3)", [1, 2]);
      tester.assertExecutionOk("takeWhile([1, 2, 3], |$x| true)", [1, 2, 3]);
      tester.assertExecutionOk("takeWhile([2, 1], |$x| $x < 2)", []);
    });
    it("遇到首个「假」即停止，其后元素不被触碰", () => {
      tester.assertExecutionOk(
        String.raw`takeWhile([1, 3, 1//0], |$x| $x < 2)`,
        [1],
      );
    });
    it("谓词返回非布尔值报错", () => {
      tester.assertExecutionRuntimeError(
        "takeWhile([1], |$x| $x)",
        "作为第 2 个参数传入通常函数 takeWhile/2 的返回值类型与期待不符：" +
          "期待「布尔」，实际「整数」。",
      );
    });
    it("谓词出错则整体出错", () => {
      tester.assertExecutionRuntimeError(
        String.raw`takeWhile([1, 2], |$x| 1//0)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });

  describe("drop/2", () => {
    it("列表", () => {
      tester.assertExecutionOk("drop([1, 2, 3], 1)", [2, 3]);
      tester.assertExecutionOk("drop([1, 2, 3], 5)", []);
      tester.assertExecutionOk("drop([], 3)", []);
      tester.assertExecutionOk("drop([1, 2], 0)", [1, 2]);
      tester.assertExecutionOk("drop([1, 2], -1)", [1, 2]);
    });
    it("序列：返回新的普通序列，状态按位置传递", () => {
      tester.assertExecutionOk("drop(3d1, 1)", [1, 1]);
      tester.assertExecutionOk("drop(d1, 0) |> take(2)", [1, 1]);
      // 注：drop(3d1, 3) 之类把名义长度内的项全部丢掉后，剩余流如 d 一样
      // 无限——转换为列表是无界的（契约明确不测该形状）。
    });
    it("构造时不拉取，被拉取时才跳过（随机数流对齐）", () => {
      // d6 流的第 3 次拉取 = take(d6, 3) 的第 3 项。
      const third = tester.evaluate("at(take(d6, 3), 2)", {
        execution: { seed: 99 },
      });
      assert.ok(third[0] === "ok");
      const result = tester.evaluate("drop(d6, 2) |> take(1)", {
        execution: { seed: 99 },
      });
      assert.ok(result[0] === "ok");
      assert.deepEqual(result[1], [third[1]]);
    });
    it("不在结果中时完全不拉取", () => {
      tester.assertExecutionOk(String.raw`count([drop(d6, 1)])`, 1);
    });
  });

  describe("dropWhile/2", () => {
    it("基本行为", () => {
      tester.assertExecutionOk("dropWhile([], |$x| true)", []);
      tester.assertExecutionOk("dropWhile([1, 2, 3], |$x| $x < 3)", [3]);
      tester.assertExecutionOk("dropWhile([1, 2, 3], |$x| true)", []);
      tester.assertExecutionOk("dropWhile([1, 2, 3], |$x| false)", [
        1,
        2,
        3,
      ]);
      tester.assertExecutionOk("dropWhile([3, 2, 1], |$x| $x < 3)", [
        3,
        2,
        1,
      ]);
    });
    it("停止后的剩余元素不再被谓词触碰", () => {
      tester.assertExecutionOk(
        String.raw`count(dropWhile([1, 3, 1//0], |$x| $x < 2))`,
        2,
      );
    });
    it("谓词返回非布尔值报错", () => {
      tester.assertExecutionRuntimeError(
        "dropWhile([1], |$x| $x)",
        "作为第 2 个参数传入通常函数 dropWhile/2 的返回值类型与期待不符：" +
          "期待「布尔」，实际「整数」。",
      );
    });
    it("谓词出错则整体出错", () => {
      tester.assertExecutionRuntimeError(
        String.raw`dropWhile([1], |$x| 1//0)`,
        `操作 “1 // 0” 非法：除数不能为零`,
      );
    });
  });
});
