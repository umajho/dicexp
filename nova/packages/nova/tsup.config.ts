import { defineConfig } from "tsup";

export default defineConfig({
  entry: { lib: "lib.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
});
