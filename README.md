# <ruby><abbr title="DICe EXPression">Dicexp</abbr><rt>骰子表达式</rt><ruby>

![](https://img.shields.io/badge/WIP-Do%20Not%20Use-yellow)

> 谨此纪念 A 岛的跑团版。

| <ruby>实验场<rt>Playground</rt></ruby> |         使用文档         |                                                    待办事项                                                     |
| :------------------------------------: | :----------------------: | :-------------------------------------------------------------------------------------------------------------: |
|    https://umajho.github.io/dicexp/    | [这里](./docs/Dicexp.md) | [![GitHub issues](https://img.shields.io/github/issues/umajho/dicexp)](https://github.com/umajho/dicexp/issues) |

Dicexp 是一门用于模拟投掷骰子的领域特定语言。由于这门语言尚处于较为早期的<wbr/>
开发阶段，尚无成型的标准/规格，因此：

- 目前将 “[@dicexp/naive-evaluator]” 视为这门语言本身的事实标准；
- 目前将 “[@dicexp/naive-evaluator-builtins]” 视为这门语言内建函数的事实标准。

“[@dicexp/naive-evaluator]” 也是目前仅有的求值器实现，使用方法请移步该包。

[@dicexp/naive-evaluator]: https://www.npmjs.com/package//@dicexp/naive-evaluator
[@dicexp/naive-evaluator-builtins]: https://www.npmjs.com/package//@dicexp/naive-evaluator-builtins

## 开发的预备工作

- 安装 [just](https://just.systems)。
- 安装 [Node.js](https://nodejs.org)、[pnpm](https://pnpm.io)。
- 安装 tsc、rollup（`pnpm install -g typescript rollup`）。
- 若涉及 playground：
  - 安装 brotli：用于构建。

## 文件夹结构

- `internal`：项目内部代码，一般不会发布到 npm 上，即使发布了也完全不会对 API
  稳定性作保证。
- `packages`：会发布在 npm 上的库，除主版本 `0` 之外，保证大版本内公开 API
  的兼容性。
- `playground`：一个简单的单网页应用，提供最基本的 dicexp 使用体验。
