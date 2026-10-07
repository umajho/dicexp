import { DeclarationListToDocumentationMap } from "@dicexp/naive-evaluator-runtime/regular-functions";

import { builtinFunctionDeclarations } from "./declarations";

export const builtinFunctionDocumentations: DeclarationListToDocumentationMap<
  typeof builtinFunctionDeclarations
> = {
  // 掷骰：
  "reroll/2": {
    groups: ["掷骰"],
    parameters: {
      "seq": "序列",
      "callable": "用于判断是否满足重投条件",
    },
    description: {
      brief: "重投",
      further: [
        "对于序列所产出的每个结果，如果该结果满足重投条件，则这次结果不作数。",
      ].join("\n"),
    },
    returnValue: { type: { description: "与序列在隐式转换后的类型相同" } },
    examples: [
      String.raw`reroll(10d10, |$x| $x <= 5)`,
      String.raw`reroll(10#d10, |$x| $x <= 5)`,
    ],
  },
  "explode/2": {
    groups: ["掷骰"],
    parameters: {
      "seq": "序列",
      "callable": "用于判断是否满足条件",
    },
    description: {
      brief: "爆炸骰",
      further: [
        "对于序列所产出的结果，每有一个结果满足条件，则额外增加一次产出。",
      ].join("\n"),
    },
    returnValue: { type: { description: "与序列在隐式转换后的类型相同" } },
    examples: [
      String.raw`explode(10d10, |$x| $x > 5)`,
      String.raw`explode(10#d10, |$x| $x > 5)`,
    ],
  },

  // 实用：
  "abs/1": {
    groups: ["实用"],
    parameters: {
      "n": "一个整数",
    },
    description: { brief: "求绝对值" },
    examples: [
      "abs(-5)",
      "abs(5)",
    ],
  },
  "count/1": {
    groups: ["实用"],
    parameters: {
      "list": "要计数的列表",
    },
    description: {
      brief: "计数列表项",
      further: "只数项数，不求值列表项。",
    },
    examples: [
      "count([1, 2, 3])",
      "count([])",
    ],
  },
  "count/2": {
    groups: ["实用"],
    parameters: {
      "list": "要计数的列表",
      "callable": "用于判断元素是否计入。输入列表元素，期待输出布尔值",
    },
    description: { brief: "有条件计数列表" },
    examples: [
      String.raw`count([2, 4, 6], |$x| $x<5)`,
    ],
  },
  "has?/2": {
    groups: ["实用"],
    parameters: {
      "list": "目标列表",
      "value": "要查找的整数或布尔值",
    },
    description: {
      brief: "判断列表中是否存在某值",
      further: "由左至右逐个求值列表项，遇到相等的项即刻返回「真」。",
    },
    examples: [
      "has?([1, 2, 3], 2)",
      "has?([true, false], true)",
      "has?([1, 2, 3], 4)",
    ],
  },
  // ...
  "sum/1": {
    groups: ["实用"],
    parameters: {
      "list": "由整数组成的列表",
    },
    description: { brief: "求列表项之和" },
    examples: [
      "sum([2, 3, 4])",
    ],
  },
  "product/1": {
    groups: ["实用"],
    parameters: {
      "list": "由整数组成的列表",
    },
    description: { brief: "求列表项之积" },
    examples: [
      "product([2, 3, 4])",
    ],
  },
  "min/1": {
    groups: ["实用"],
    parameters: {
      "list": "由整数组成的列表",
    },
    description: {
      brief: "求列表项中最小者",
      further: "空列表会报错。",
    },
    examples: [
      "min([2, 3, 4])",
    ],
  },
  "max/1": {
    groups: ["实用"],
    parameters: {
      "list": "由整数组成的列表",
    },
    description: {
      brief: "求列表项中最大者",
      further: "空列表会报错。",
    },
    examples: [
      "max([2, 3, 4])",
    ],
  },
  "all?/1": {
    groups: ["实用"],
    parameters: {
      "list": "由布尔值组成的列表",
    },
    description: {
      brief: "判断列表中是否全部为「真」",
      further: "空列表返回「真」。",
    },
    examples: [
      "all?([true, true])",
      "all?([true, false])",
      "all?([])",
    ],
  },
  // ...
  "any?/1": {
    groups: ["实用"],
    parameters: {
      "list": "由布尔值组成的列表",
    },
    description: {
      brief: "判断列表中是否存在「真」",
      further: "空列表返回「假」。",
    },
    examples: [
      "any?([false, false])",
      "any?([true, false])",
      "any?([])",
    ],
  },
  // ...
  "sort/1": {
    groups: ["实用"],
    parameters: {
      "list": "要排序的列表。所有元素类型一致，可以是整数或布尔值",
    },
    description: { brief: "排序列表（由小到大）" },
    examples: [
      "sort([100, 10, 1000, -10, 0])",
    ],
  },
  "sort/2": {
    groups: ["实用"],
    parameters: {
      "list": "要排序的列表",
      "callable":
        "比较两个元素的操作。输入两个列表元素，期待输出布尔值：「真」代表前者不晚于后者",
    },
    description: {
      brief: "按照操作排序列表",
      further: "稳定排序：比较结果相同时保持原有相对顺序。",
    },
    examples: [
      String.raw`sort([100, 10, 1000], |$a, $b| $a <= $b)`,
      String.raw`sort([100, 10, 1000], |$a, $b| $a >= $b)`,
    ],
  },
  "reverse/1": {
    groups: ["实用"],
    parameters: {
      "list": "要反转的列表",
    },
    description: { brief: "反转列表" },
    examples: [
      "reverse([1, 2, 3])",
    ],
  },
  "concat/2": {
    groups: ["实用"],
    parameters: {
      "list1": "第一个列表",
      "list2": "第二个列表",
    },
    description: { brief: "连接两个列表" },
    examples: [
      "concat([1, 2], [3, 4])",
    ],
  },
  "prepend/2": {
    groups: ["实用"],
    parameters: {
      "list": "要添加元素的列表",
      "el": "要添加的元素",
    },
    description: { brief: "追加元素至列表开头" },
    examples: [
      "prepend([2, 3], 1)",
    ],
  },
  "append/2": {
    groups: ["实用"],
    parameters: {
      "list": "要添加元素的列表",
      "el": "要添加的元素",
    },
    description: { brief: "追加元素至列表最后" },
    examples: [
      "append([1, 2], 3)",
      "append([], 42)",
    ],
  },
  "at/2": {
    groups: ["实用"],
    parameters: {
      "list": "要取出元素的列表",
      "index": "要取出的元素的索引，以 0 开始",
    },
    description: {
      brief: "取出列表中索引处对应值",
      further: "索引由 0 开始。",
    },
    returnValue: { type: { description: "取出元素的类型" } },
    examples: [
      "at([1, 2, 3], 0)",
      "at([1, 2, 3], 2)",
    ],
  },
  "at/3": {
    groups: ["实用"],
    parameters: {
      "list": "要取出元素的列表",
      "index": "要取出的元素的索引，以 0 开始",
      "default": "索引越界时取出的默认值",
    },
    description: {
      brief: "取出列表中索引处对应值（带默认值）",
      further: [
        "索引由 0 开始。",
        "索引越界时不报错，而是取出默认值。",
      ].join("\n"),
    },
    returnValue: { type: { description: "取出元素（或默认值）的类型" } },
    examples: [
      "at([1, 2, 3], 0, 0)",
      "at([1, 2, 3], 5, 0)",
    ],
  },
  "duplicate/2": {
    groups: ["实用"],
    parameters: {
      "value": "要重复的值",
      "count": "重复的次数，不小于 0",
    },
    description: {
      brief: "重复值若干次，组成列表",
      further: [
        "值只求值一次，列表中是同一个值的重复（如投掷骰子只投一次）。",
        "要重复求值（如多次投掷骰子），请使用 “#”。",
      ].join("\n"),
    },
    examples: [
      "duplicate(1, 3)",
      String.raw`duplicate(d6, 3)`,
    ],
  },
  "flatten/2": {
    groups: ["实用"],
    parameters: {
      "list": "要扁平化的列表",
      "depth": "扁平化的深度，不小于 0",
    },
    description: {
      brief: "扁平化列表至给定深度",
      further: [
        "深度界限之上的嵌套列表会被合并；界限上的列表保持原样。",
        "深度为 0 时只浅层复制列表。",
      ].join("\n"),
    },
    examples: [
      "flatten([1, [2, [3]]], 1)",
      "flatten([1, [2, [3]]], 2)",
    ],
  },
  "flattenAll/1": {
    groups: ["实用"],
    parameters: {
      "list": "要扁平化的列表",
    },
    description: {
      brief: "完全扁平化列表",
      further: "深度不设限，所有嵌套列表都会被合并。",
    },
    examples: [
      "flattenAll([1, [2, [3, [[4]]]]])",
    ],
  },

  // 函数式：
  "map/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "callable": "对每个元素的映射操作。输入列表元素，期待输出映射结果",
    },
    description: {
      brief: "映射列表项",
      further: "返回元素由先前对应元素经过操作变换后的新列表。",
    },
    examples: [
      String.raw`map([1, 2, 3], |$x| $x**2)`,
      String.raw`map([1, 2, 3], &-/1)`,
    ],
  },
  "flatMap/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "callable":
        "对每个元素的映射操作。输入列表元素，期待输出由映射结果组成的列表",
    },
    description: {
      brief: "映射列表项并合并结果",
      further: [
        "先映射再作深度为 1 的扁平化：每个元素经操作得到一个列表，",
        "这些列表的元素依序合并为新列表。",
      ].join(""),
    },
    examples: [
      String.raw`flatMap([1, 2], |$x| [$x, $x])`,
    ],
  },
  // ...
  "filter/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "callable": "用于判断元素是否保留。输入列表元素，期待输出布尔值",
    },
    description: {
      brief: "过滤列表项",
      further: "返回由通过过滤的元素组成的新列表。",
    },
    examples: [
      String.raw`filter([2, 4, 6], |$x| $x<5)`,
    ],
  },
  "foldl/3": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "init": "累积值的初始值",
      "callable":
        "合并累积值与元素的操作。输入累积值与列表元素，期待输出新的累积值",
    },
    description: {
      brief: "自左向右折叠列表",
      further: "每一步都会先求值累积值；空列表直接返回初始值。",
    },
    returnValue: { type: { description: "累积结果的类型" } },
    examples: [
      String.raw`foldl([1, 2, 3], 0, |$acc, $e| $acc + $e)`,
    ],
  },
  "foldr/3": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "init": "累积值的初始值",
      "callable":
        "合并元素与累积值的操作。输入列表元素与累积值，期待输出新的累积值",
    },
    description: {
      brief: "自右向左折叠列表",
      further: "累积值是否求值由操作决定；空列表直接返回初始值。",
    },
    returnValue: { type: { description: "累积结果的类型" } },
    examples: [
      String.raw`foldr([1, 2, 3], 0, |$e, $acc| $e + $acc)`,
    ],
  },
  "unfold/2": {
    groups: ["函数式"],
    parameters: {
      "seed": "初始种子值",
      "callable":
        "展开一步的操作。输入种子，期待输出布尔值或含两个元素的列表：「假」代表结束；列表的第一个元素作为产出项，第二个元素作为下一个种子",
    },
    description: {
      brief: "按操作展开为序列",
      further: "返回有限的序列：操作返回「假」时序列结束。",
    },
    examples: [
      String.raw`unfold(3, |$n| [$n, $n - 1]) |> take(3)`,
    ],
  },
  "iterate/2": {
    groups: ["函数式"],
    parameters: {
      "start": "首项的值",
      "callable":
        "由当前项计算下一项的操作。输入当前项，期待输出下一项",
    },
    description: {
      brief: "按操作迭代为序列",
      further: "返回无限的序列：首项为 start，其后每项由操作自前一项算得。",
    },
    examples: [
      String.raw`iterate(1, |$x| $x + 1) |> take(5)`,
    ],
  },
  // ...
  "head/1": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
    },
    description: { brief: "取出列表首个元素" },
    returnValue: { type: { description: "首个元素的类型" } },
    examples: [
      "head([1, 2, 3])",
    ],
  },
  "tail/1": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
    },
    description: {
      brief: "排除列表首个元素",
      further: "返回不含原先列表中首个元素的新列表。",
    },
    examples: [
      "tail([1, 2, 3])",
    ],
  },
  "last/1": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
    },
    description: {
      brief: "取出列表末个元素",
      further: "空列表会报错。",
    },
    returnValue: { type: { description: "末个元素的类型" } },
    examples: [
      "last([1, 2, 3])",
    ],
  },
  "init/1": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
    },
    description: {
      brief: "排除列表末个元素",
      further: "返回不含原先列表中末个元素的新列表。空列表会报错。",
    },
    examples: [
      "init([1, 2, 3])",
    ],
  },
  "take/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表或序列",
      "n": "取出的项数",
    },
    description: {
      brief: "取出列表或序列的前若干项",
      further: [
        "返回由前 n 项组成的列表；项数不足时有多少取多少。",
        "对于序列，会拉取 n 个实际位置（越过名义上的结束位置继续拉取）。",
      ].join("\n"),
    },
    examples: [
      "take([1, 2, 3], 2)",
      String.raw`iterate(1, |$x| $x + 1) |> take(5)`,
    ],
  },
  "takeWhile/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "callable": "用于判断元素是否保留。输入列表元素，期待输出布尔值",
    },
    description: {
      brief: "取出列表中满足条件的前缀",
      further: "遇到第一个不满足条件的元素即停止，其后的元素不再被触碰。",
    },
    examples: [
      String.raw`takeWhile([1, 2, 3], |$x| $x < 3)`,
    ],
  },
  "drop/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表或序列",
      "n": "舍弃的项数",
    },
    description: {
      brief: "舍弃列表或序列的前若干项",
      further: [
        "对于列表，返回舍弃前 n 项后的新列表。",
        "对于序列，返回新的序列：只在被拉取时才跳过 n 次拉取。",
      ].join("\n"),
    },
    returnValue: { type: { description: "与输入的类型相同" } },
    examples: [
      "drop([1, 2, 3], 1)",
      String.raw`iterate(1, |$x| $x + 1) |> drop(2) |> take(3)`,
    ],
  },
  "dropWhile/2": {
    groups: ["函数式"],
    parameters: {
      "list": "目标列表",
      "callable": "用于判断元素是否舍弃。输入列表元素，期待输出布尔值",
    },
    description: {
      brief: "舍弃列表中满足条件的前缀",
      further: "遇到第一个不满足条件的元素即保留其起的全部剩余元素。",
    },
    examples: [
      String.raw`dropWhile([1, 2, 3], |$x| $x < 3)`,
    ],
  },
  "zip/2": {
    groups: ["函数式"],
    parameters: {
      "list1": "第一个列表",
      "list2": "第二个列表",
    },
    description: {
      brief: "合并两个列表",
      further: [
        "新的列表的每个元素是由原先两个列表对应位置的元素组合而成的、长度为 2 的列表。",
        "如果两个列表长度不同，只会合并到较短列表的结束位置。",
      ].join("\n"),
    },
    examples: [
      "zip([1, 2, 3], [4, 5, 6])",
    ],
  },
  "zipWith/3": {
    groups: ["函数式"],
    parameters: {
      "list1": "第一个列表",
      "list2": "第二个列表",
      "callable":
        "合并两个元素的操作。输入两个列表位置对应的两个元素，期待输出合并结果",
    },
    description: {
      brief: "按照操作合并两个列表",
      further: [
        "新的列表的每个元素是由原先两个列表对应位置的元素由调用 callable 合并而成。",
        "如果两个列表长度不同，只会合并到较短列表的结束位置。",
      ].join("\n"),
    },
    examples: [
      String.raw`zipWith([1, 2, 3], [4, 5, 6], &*/2)`,
      String.raw`zipWith([1, 2, 3], [4, 5, 6], |$a, $b| $a#$b)`,
    ],
  },
  // 控制流
};
