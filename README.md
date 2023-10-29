# <ruby><abbr title="DICe EXPression">Dicexp</abbr><rt>骰子表达式</rt><ruby>

![](https://img.shields.io/badge/WIP-Do%20Not%20Use-yellow)

> In memory of ADNMB.

|                                        |                                                      链接                                                       |
| :------------------------------------: | :-------------------------------------------------------------------------------------------------------------: |
| <ruby>实验场<rt>Playground</rt></ruby> |                                        https://umajho.github.io/dicexp/                                         |
|                使用文档                |                                            [这里](./docs/Dicexp.md)                                             |
|                待办事项                | [![GitHub issues](https://img.shields.io/github/issues/umajho/dicexp)](https://github.com/umajho/dicexp/issues) |

## 预备工作

- 安装 [just](https://just.systems)。
- 安装 [Node.js](https://nodejs.org)、[pnpm](https://pnpm.io)。
- 安装 tsc、rollup（`pnpm install -g typescript rollup`）。
- 安装 brotli：构建 playground 用。

## 文件夹结构

- `internal`：项目内部代码，一般不会发布到 npm 上，即使发布了也完全不会对 API
  稳定性作保证。
- `packages`：会发布在 npm 上的库，除主版本 `0` 之外，保证大版本内公开 API
  的兼容性。
  - `dicexp`：提供解析、执行 dicexp 代码的 API。
- `playground`：一个简单的单网页应用，提供最基本的 dicexp 使用体验。
