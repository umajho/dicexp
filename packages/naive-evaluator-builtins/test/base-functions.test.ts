import { describe } from "vitest";

import { makeTester, scopeWith } from "./utils";

import { functionScope, operatorScope } from "../lib";

describe("base/functions", () => {
  describe("掷骰", () => {
    describe("reroll/2", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["reroll/2"]),
        ...scopeWith(operatorScope, ["d/2", "<=/2"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`10d6 |> reroll |$x| $x <= 5`, 60],
        ]);
      });
    });
    describe.todo("explode/2");
  });
  describe("实用", () => {
    describe("count/2", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["count/2"]),
        ...scopeWith(operatorScope, [">=/2"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`count([], |_| true)`, 0],
          [String.raw`count([1, 2, 3], |$x| $x >= 2)`, 2],
        ]);
      });
    });
    describe("sum/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["sum/1"]),
        ...scopeWith(operatorScope, ["-/1"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`sum([10, -200, 3000])`, 2810],
        ]);
      });
    });
    describe("product/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["product/1"]),
        ...scopeWith(operatorScope, ["-/1"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`product([10, -20, 30])`, -6000],
        ]);
      });
    });
    describe("any?/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["any?/1"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`any?([])`, false],
          [String.raw`any?([false])`, false],
          [String.raw`any?([false, true])`, true],
        ]);
      });
    });
    describe("sort/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["sort/1"]),
        ...scopeWith(operatorScope, ["-/1"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`sort([])`, []],
          [String.raw`sort([1, -2, 3])`, [-2, 1, 3]],
        ]);
      });
    });
    describe("append/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["append/2"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`append([], 1)`, [1]],
          [String.raw`append([1], 2)`, [1, 2]],
          [String.raw`append([1], [true])`, [1, [true]]],
        ]);
      });
    });
    describe("at/1", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["at/2"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`at([10, 20, 30], 1)`, 20],
        ]);
      });
    });
  });
  describe("函数式", () => {
    describe("map/2", () => {
      const topLevelScope = {
        ...scopeWith(functionScope, ["map/2"]),
        ...scopeWith(operatorScope, ["*/2"]),
      };
      const tester = makeTester({ topLevelScope });
      describe("正确使用时", () => {
        tester.theyAreOk([
          [String.raw`map([], || 0)`, []],
          [String.raw`map([1, 2, 3], |$x| $x * $x)`, [1, 4, 9]],
        ]);
      });
    });
  });
  describe("filter/2", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["filter/2"]),
      ...scopeWith(operatorScope, ["-/1", ">=/2"]),
    };
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
        [String.raw`filter([], || 0)`, []],
        [String.raw`filter([1, -2, 3, -4], |$x| $x >= 0)`, [1, 3]],
      ]);
    });
  });
  describe("head/1", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["head/1"]),
    };
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
        [String.raw`head([1, 2, 3])`, 1],
      ]);
    });
  });
  describe("tail/1", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["tail/1"]),
    };
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
        [String.raw`tail([1, 2, 3])`, [2, 3]],
      ]);
    });
  });
  describe("zip/2", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["zip/2"]),
    };
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
        [String.raw`zip([1, 2, 3], [4, 5, 6])`, [[1, 4], [2, 5], [3, 6]]],
        [String.raw`zip([1, 2, 3], [4])`, [[1, 4]]],
        [String.raw`zip([1], [4, 5, 6])`, [[1, 4]]],
      ]);
    });
  });
  describe("zipWith/3", () => {
    const topLevelScope = {
      ...scopeWith(functionScope, ["zipWith/3"]),
      ...scopeWith(operatorScope, ["*/2"]),
    };
    const tester = makeTester({ topLevelScope });
    describe("正确使用时", () => {
      tester.theyAreOk([
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
