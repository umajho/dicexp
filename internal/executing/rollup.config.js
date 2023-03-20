import typescript from "@rollup/plugin-typescript";

export default {
  input: "./lib.ts",
  output: {
    dir: "./dist",
    format: "esm",
  },
  plugins: [typescript()],
  external: ["@dicexp/nodes", "esm-seedrandom", "browser-util-inspect"],
};
