# dicexp.js

## Usage

```javascript
import { asScope, Evaluator } from "@dicexp/naive-evaluator";
import { functionScope, operatorScope } from "@dicexp/naive-evaluator-builtins";

// 将 “运算符作用域” 与 “函数作用域” 合并为一个作用域
const topLevelScope = asScope([operatorScope, functionScope]);

// 构造求值器
const evaluator = new Evaluator({
  topLevelScope,
  randomSourceMaker: "xorshift7",
});

// 求值
const result = evaluator.evaluate(
  "(sort(10#d100) |> head) + 5d10",
  { execution: { seed: 42 } },
);

if (result[0] === "ok") {
  // result 元组为 `["ok", value, appendix]`
  const resultValue = result[1];
  console.log("结果：" + resultValue);
} else if (result[0] === "error") {
  // result 元组为 `["error", …]`
  if (result[1] === "parse") {
    // result 元组为 `["error", "parse", error]`
    console.log("解析错误：" + result[2].message);
  } else if (result[1] === "runtime") {
    // result 元组为 `["error", "runtime", runtimeError, appendix]`
    console.log("执行错误：" + result[2].message);
  } else if (result[1] === "other") {
    // result 元组为 `["error", "other", error]`
    console.log("其他错误：" + result[2].message);
  } else {
    throw new Error("impossible");
  }
} else {
  throw new Error("impossible");
}
```
