# @dicexp/executing

## Ubiquitous Language

### 求值

考虑到 “evaluate” 一词承载了过多的含义，根据应用场景做如下拆分：

- 去除 `LazyValue` 的惰性：“delazy”，返回的对象类型叫 “YieldedLazyValue”
- `LazyValue` 求值实现：“_yield”
- 根据单个 `Node` 解释代码：“interpret”
- 执行整个 `Node`：“execute”，而最后一步去除惰性是 “finalize”

未来预计会去掉 `reevaluate`，因此就不改名了。
