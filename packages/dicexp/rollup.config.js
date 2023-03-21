import typescript from "rollup-plugin-typescript2";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default [
  {
    input: "./lib.ts",
    output: {
      file: "./dist/lib.js",
      format: "esm",
    },
    plugins: [typescript()],
    external: ["@dicexp/parsing", "@dicexp/executing"],
  },
  {
    input: "./lib.ts",
    output: {
      file: "./dist/browser.min.js",
      format: "esm",
    },
    plugins: [typescript(), nodeResolve(), commonjs(), terser()],
  },
];
