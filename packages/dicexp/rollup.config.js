import typescript from "rollup-plugin-typescript2";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default [
  {
    input: "./lib.ts",
    output: {
      file: "./dist/lib.esm.js",
      format: "esm",
    },
    plugins: [typescript(), nodeResolve(), commonjs()],
  },
  {
    input: "./lib.ts",
    output: {
      file: "./dist/browser.esm.js",
      format: "esm",
    },
    plugins: [typescript(), nodeResolve({ browser: true }), commonjs()],
  },
  {
    input: "./dist/browser.esm.js",
    output: {
      file: "./dist/browser.min.js",
      format: "iife",
      name: "dicexp",
    },
    plugins: [terser()],
  },
];
