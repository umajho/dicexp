import { describe } from "vitest";

import { theyAreOk } from "@dicexp/test-utils-for-executing";

import { scopeWith } from "./utils";

import { functionScope, operatorScope } from "../lib";

describe("base.operators", () => {
  describe("or/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["or/2"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`true or true`, true],
        [String.raw`true or false`, true],
        [String.raw`false or true`, true],
        [String.raw`false or false`, false],
      ], { topLevelScope });
    });
  });
  describe("and/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["and/2"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`true and true`, true],
        [String.raw`true and false`, false],
        [String.raw`false and true`, false],
        [String.raw`false and false`, false],
      ], { topLevelScope });
    });
  });
  describe("==/2, !=/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["==/2", "!=/2"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`true == true`, true],
        [String.raw`true != true`, false],
        [String.raw`1 == 1`, true],
        [String.raw`1 != 1`, false],
        [String.raw`1 == 2`, false],
        [String.raw`1 != 2`, true],
      ], { topLevelScope });
    });
  });
  describe("</2, >/2, <=/2, >=/2", () => {
    const topLevelScope = scopeWith(
      operatorScope,
      ["</2", ">/2", "<=/2", ">=/2"],
    );
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`0 < 1`, true],
        [String.raw`0 <= 1`, true],
        [String.raw`0 > 1`, false],
        [String.raw`0 >= 1`, false],
        [String.raw`0 < 0`, false],
        [String.raw`0 <= 0`, true],
        [String.raw`0 > 0`, false],
        [String.raw`0 >= 0`, true],
        [String.raw`1 < 0`, false],
        [String.raw`1 <= 0`, false],
        [String.raw`1 > 0`, true],
        [String.raw`1 >= 0`, true],
      ], { topLevelScope });
    });
  });
  describe.todo("~/2, ~/1");
  describe("+/2, -/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["+/2", "-/2"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`2+3`, 5],
        [String.raw`2-3`, -1],
      ], { topLevelScope });
    });
  });
  describe("+/1, -/1", () => {
    const topLevelScope = scopeWith(operatorScope, ["+/1", "-/1"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`+1`, 1],
        [String.raw`-1`, -1],
      ], { topLevelScope });
    });
  });
  describe("*/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["*/2"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`2*3`, 6],
      ], { topLevelScope });
    });
  });
  describe("///2", () => {
    const topLevelScope = scopeWith(operatorScope, ["///2", "-/1"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`2//3`, 0],
        [String.raw`3//3`, 1],
        [String.raw`4//3`, 1],
        [String.raw`(-4)//3`, -1],
        [String.raw`4//(-3)`, -1],
        [String.raw`(-4)//(-3)`, 1],
      ], { topLevelScope });
    });
  });
  describe("%/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["%/2"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`2%3`, 2],
        [String.raw`3%2`, 1],
      ], { topLevelScope });
    });
  });
  describe("^/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["^/2", "-/1"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`2^3`, 8],
        [String.raw`(-2)^3`, -8],
      ], { topLevelScope });
    });
  });
  describe.todo("d/2, d/1");
  describe("not/2", () => {
    const topLevelScope = scopeWith(operatorScope, ["not/1"]);
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`not true`, false],
        [String.raw`not false`, true],
      ], { topLevelScope });
    });
  });
});

describe("base.functions", () => {
  describe("实用", () => {
    describe("count/2", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["count/2"]),
        ...scopeWith(operatorScope, [">=/2"]),
      };
      describe("正确使用时", () => {
        theyAreOk([
          [String.raw`count([], \(_ -> true))`, 0],
          [String.raw`count([1, 2, 3], \($x -> $x >= 2))`, 2],
        ], { topLevelScope });
      });
    });
    describe("sum/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["sum/1"]),
        ...scopeWith(operatorScope, ["-/1"]),
      };
      describe("正确使用时", () => {
        theyAreOk([
          [String.raw`sum([10, -200, 3000])`, 2810],
        ], { topLevelScope });
      });
    });
    describe("product/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["product/1"]),
        ...scopeWith(operatorScope, ["-/1"]),
      };
      describe("正确使用时", () => {
        theyAreOk([
          [String.raw`product([10, -20, 30])`, -6000],
        ], { topLevelScope });
      });
    });
    describe("any?/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["any?/1"]),
      };
      describe("正确使用时", () => {
        theyAreOk([
          [String.raw`any?([])`, false],
          [String.raw`any?([false])`, false],
          [String.raw`any?([false, true])`, true],
        ], { topLevelScope });
      });
    });
    describe("sort/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["sort/1"]),
        ...scopeWith(operatorScope, ["-/1"]),
      };
      describe("正确使用时", () => {
        theyAreOk([
          [String.raw`sort([])`, []],
          [String.raw`sort([1, -2, 3])`, [-2, 1, 3]],
        ], { topLevelScope });
      });
    });
    describe("append/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["append/2"]),
      };
      describe("正确使用时", () => {
        theyAreOk([
          [String.raw`append([], 1)`, [1]],
          [String.raw`append([1], 2)`, [1, 2]],
          [String.raw`append([1], [true])`, [1, [true]]],
        ], { topLevelScope });
      });
    });
    describe("at/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["at/2"]),
      };
      describe("正确使用时", () => {
        theyAreOk([
          [String.raw`at([10, 20, 30], 1)`, 20],
        ], { topLevelScope });
      });
    });
  });
  describe("函数式", () => {
    describe("map/2", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["map/2"]),
        ...scopeWith(operatorScope, ["*/2"]),
      };
      describe("正确使用时", () => {
        theyAreOk([
          [String.raw`map([], \(-> 0))`, []],
          [String.raw`map([1, 2, 3], \($x -> $x * $x))`, [1, 4, 9]],
        ], { topLevelScope });
      });
    });
  });
  describe("filter/2", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["filter/2"]),
      ...scopeWith(operatorScope, ["-/1", ">=/2"]),
    };
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`filter([], \(-> 0))`, []],
        [String.raw`filter([1, -2, 3, -4], \($x -> $x >= 0))`, [1, 3]],
      ], { topLevelScope });
    });
  });
  describe("head/1", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["head/1"]),
    };
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`head([1, 2, 3])`, 1],
      ], { topLevelScope });
    });
  });
  describe("tail/1", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["tail/1"]),
    };
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`tail([1, 2, 3])`, [2, 3]],
      ], { topLevelScope });
    });
  });
  describe("zip/2", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["zip/2"]),
    };
    describe("正确使用时", () => {
      theyAreOk([
        [String.raw`zip([1, 2, 3], [4, 5, 6])`, [[1, 4], [2, 5], [3, 6]]],
        [String.raw`zip([1, 2, 3], [4])`, [[1, 4]]],
        [String.raw`zip([1], [4, 5, 6])`, [[1, 4]]],
      ], { topLevelScope });
    });
  });
  describe("zipWith/3", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["zipWith/3"]),
      ...scopeWith(operatorScope, ["*/2"]),
    };
    describe("正确使用时", () => {
      theyAreOk([
        [
          String.raw`zipWith([1, 2, 3], [4, 5, 6], \($a, $b -> $a * $b))`,
          [4, 10, 18],
        ],
        [String.raw`zipWith([1, 2, 3], [4], \($a, $b -> $a * $b))`, [4]],
        [String.raw`zipWith([1], [4, 5, 6], \($a, $b -> $a * $b))`, [4]],
      ], { topLevelScope });
    });
  });
});