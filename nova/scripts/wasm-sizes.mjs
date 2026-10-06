// Reports the shipped nova wasm asset sizes as a markdown table: raw bytes,
// gzip (level 9), brotli (max quality). Feeds nova/docs/size-budget.md.
import { readFile } from "fs/promises";
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from "zlib";

const wasmDir = new URL("../packages/nova/wasm/", import.meta.url);
const assets = ["nova-compiler.wasm", "nova-builtins.wasm", "nova-shim.wasm"];

const formatBytes = (bytes) => `${bytes.toLocaleString("en-US")} B`;

const measure = async (name) => {
  const raw = await readFile(new URL(name, wasmDir));
  // Explicit max quality (11) — the gzip/brotli defaults may change upstream.
  const gzip = gzipSync(raw, { level: 9 }).length;
  const brotli = brotliCompressSync(raw, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  }).length;
  return { name, raw: raw.length, gzip, brotli };
};

const rows = await Promise.all(assets.map(measure));

const total = rows.reduce(
  (acc, row) => ({
    raw: acc.raw + row.raw,
    gzip: acc.gzip + row.gzip,
    brotli: acc.brotli + row.brotli,
  }),
  { raw: 0, gzip: 0, brotli: 0 },
);

console.log("| asset | raw | gzip (level 9) | brotli (max quality) |");
console.log("| --- | ---: | ---: | ---: |");
for (const { name, raw, gzip, brotli } of rows) {
  console.log(
    `| ${name} | ${formatBytes(raw)} | ${formatBytes(gzip)} | ${formatBytes(brotli)} |`,
  );
}
console.log(
  `| **total** | ${formatBytes(total.raw)} | ${formatBytes(total.gzip)} | ${formatBytes(total.brotli)} |`,
);
