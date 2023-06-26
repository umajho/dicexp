import { resolve } from "node:path";

import { defineConfig } from "vite";

import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "./lib.ts"),
      name: "dicexp",
      fileName: "dicexp",
    },
  },
  plugins: [dts({ entryRoot: "." })],
});
