import typescript from "rollup-plugin-typescript2";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "./main.ts",
  output: {
    file: "./dist/main.js",
    format: "esm",
  },
  plugins: [typescript(), nodeResolve(), commonjs()],
};
