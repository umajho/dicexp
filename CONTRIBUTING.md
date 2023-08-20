## 关于打包

`internal/`
之下的包只在内部使用项目，因此不使用打包工具。非开发环境专用的外部依赖应该放入
“peerDependencies” 中。

`packages/` 之下的包需要对外发布，使用打包工具。其依赖的内部包的 peer
依赖也应该列在其 “peerDependencies”
中，并列为外部依赖，并注意要随着内部包的更新而同步更新。

`repl` 使用 `packages/` 之下的包的构建版本，因此需要将后者的 peer 依赖作为依赖。

`playground` 目前直接引入 `packages/`
之下的包的构建后代码。后者每次更新后，需要注意重新构建后者。
