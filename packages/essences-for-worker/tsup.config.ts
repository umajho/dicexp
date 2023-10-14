import { defineConfig, Options } from "tsup";

export default defineConfig((_config) => {
  const entries = [
    { entry: "src/dicexp.ts", name: "dicexp" },
    { entry: "src/standard-scopes.ts", name: "standard-scopes" },
  ];

  return entries.map(({ entry, name }): Options => ({
    entry: [entry],
    name,
    minify: "terser",
    format: "esm",
  }));
});
