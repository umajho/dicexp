export const examples = [
  { label: "范围随机", code: "10~20" },
  { label: "掷骰", code: "3d6+4" },
  { label: "生成列表", code: "3#(d10 * 2)" },
  { label: "通常函数的调用", code: "sort(10#d100)" },
  { label: "通常函数的调用（管道）", code: "10#d100 |> sort" },
  { label: "数组", code: "sum([1, 2, 3])" },
  { label: "匿名函数作为参数", code: String.raw`3#d10 |> map(|$x| -$x)` },
  {
    label: "匿名函数作为参数（简写）",
    code: String.raw`3#d10 |> map (|$x| -$x)`,
  },
  { label: "匿名函数的调用", code: String.raw`(|_| 42).(-d100)` },
  { label: "匿名函数的调用（管道）", code: String.raw`-d100 |> (|_| 42).()` },
  {
    label: "匿名函数的调用（嵌套）",
    code: String.raw`(|$f| $f.(-d100)).(|_| 42)`,
  },
  {
    label: "综合",
    code: String.raw`10#d100 |> filter (|$x| $x >= 50) |> sum`,
  },
];
