# @dicexp/executing

## Ubiquitous Language

### 求值

考虑到 “evaluate” 一词承载了过多的含义，根据应用场景做如下拆分：

- 对 `LazyValue` 求值：“concretize”，返回的对象类型叫 “Concrete”
- `LazyValue` 求值实现：“_yield”
- 根据单个 `Node` 解释代码：“interpret”
- 执行整个 `Node`：“execute”，而最后一步去除惰性是 “finalize”
