// based on https://github.com/mitschabaude/esbuild-plugin-inline-worker
/*!
Copyright 2023 Umaĵo <umajho@tuan.run>
Copyright 2021 Gregor Mitscha-Baude

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import * as path from "node:path";

import esbuild, { type BuildOptions, type Plugin } from "esbuild";

const excludedOptionKeys = ["entryPoints", "outfile", "outdir"] as const;
type ExcludedOptionKeys = typeof excludedOptionKeys[number];
type BuildOptionsForWorker = Omit<BuildOptions, ExcludedOptionKeys>;

type PluginOptions = BuildOptionsForWorker & {
  workerName?: string;
};

const INLINE_WORKER_MODULE_NAME = "__inline-worker";
const INLINE_WORKER_MODULE_NAME_REGEX = /^__inline-worker$/;

export default function plugin(opts?: PluginOptions): Plugin {
  opts ??= {};

  return {
    "name": "esbuild-plugin-inline-worker-vite-style",
    setup: (build) => {
      build.onLoad(
        { filter: /\.(js|jsx|ts|tsx)$/ },
        async ({ suffix, path: workerPath }) => {
          if (suffix !== "?worker&inline") return null;

          const workerCode = await buildWorkerAsText(workerPath, opts!);
          const workerOpts = opts?.workerName ? { name: opts.workerName } : {};
          return {
            contents: [
              `import createWorkerConstructor from "${INLINE_WORKER_MODULE_NAME}"`,
              `const c = createWorkerConstructor(`,
              `  ${JSON.stringify(workerCode)},`,
              `  ${JSON.stringify(workerOpts)}`,
              `);`,
              `export default c;`,
            ].join("\n"),
          };
        },
      );

      build.onResolve(
        { filter: INLINE_WORKER_MODULE_NAME_REGEX },
        () => {
          return {
            path: path.resolve(__dirname, "./raw/create-worker-constructor.ts"),
          };
        },
      );
    },
  };
}

async function buildWorkerAsText(
  workerPath: string,
  opts: PluginOptions,
): Promise<string> {
  opts = structuredClone(opts);
  for (const key of [...excludedOptionKeys, "workerName"] as const) {
    delete (opts as any)[key];
  }

  const result = await esbuild.build({
    write: false,

    entryPoints: [workerPath],
    bundle: true,
    minify: true,
    target: "es2020",
    format: "esm",
    ...(opts as BuildOptions),
  });

  if (result.outputFiles?.length !== 1) {
    const l = result.outputFiles?.length ?? 0;
    throw new Error(
      `esbuild 为 worker 输出的文件数量期待 1 份，实际有 ${l} 份`,
    );
  }

  return result.outputFiles[0]!.text;
}
