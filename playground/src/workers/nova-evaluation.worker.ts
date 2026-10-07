import { startWorkerServer } from "@dicexp/nova-in-worker/internal";

import { createEvaluator } from "@dicexp/nova/internal";
import compilerUrl from "@dicexp/nova/wasm/nova-compiler.wasm?url";
import builtinsUrl from "@dicexp/nova/wasm/nova-builtins.wasm?url";
// `&no-inline`: the shim module is tiny (below vite's default asset inline
// limit), and we want it emitted as a hashed asset like the other two
// modules instead of being inlined as a base64 data URL.
import shimUrl from "@dicexp/nova/wasm/nova-shim.wasm?url&no-inline";

// Kick the fetches off at module load so the bytes are (likely) already in
// memory by the time the server handles `initialize` (the maker stays async
// either way; see `nova/docs/plan.md` §7.1).
const assets = Promise.all([
  fetch(compilerUrl).then((res) => res.arrayBuffer()),
  fetch(builtinsUrl).then((res) => res.arrayBuffer()),
  fetch(shimUrl).then((res) => res.arrayBuffer()),
]);

startWorkerServer(async () => {
  const [compiler, builtins, shim] = await assets;
  return await createEvaluator({ compiler, builtins, shim });
});
