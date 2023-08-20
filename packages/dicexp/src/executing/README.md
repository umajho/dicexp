# @dicexp/executing

## Ubiquitous Language

### 求值

考虑到 “evaluate” 一词承载了过多的含义，根据应用场景做如下拆分：

- `ValueBoxLazy` 求值实现：“yield”（变量名为 “yielder”）
- 根据单个 `Node` 解释代码：“interpret”
- 执行整个 `Node`：“execute”，而最后一步去除惰性是 “finalize”
