import { resolve } from "node:path";

import { defineConfig } from "vite";

import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "./lib.ts"),
      name: "dicexpEvaluatingWorkerManager",
      fileName: "dicexp-evaluating-worker-manager",
    },
    // NOTE: 用 `rollupOptions.external` 添加外部依赖。不过目前并没有
  },
  plugins: [dts({ entryRoot: ".", outDir: resolve(__dirname, "./dist") })],
});
