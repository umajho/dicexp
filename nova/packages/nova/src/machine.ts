/**
 * WASM machinery for nova: loads the compiler / builtins / shim modules and
 * wires them together per `nova/docs/plan.md` §3.3.
 */

import {
  DecodedCompileError,
  DecodedError,
  decodeCompileErrors,
  decodeResult,
} from "./protocol";

export interface NovaAssets {
  compiler: BufferSource | WebAssembly.Module;
  builtins: BufferSource | WebAssembly.Module;
  shim: BufferSource | WebAssembly.Module;
}

interface CompilerExports {
  memory: WebAssembly.Memory;
  __reset: () => void;
  __alloc: (len: number) => number;
  compile: (ptr: number, len: number) => number;
  __out_ptr: () => number;
  __out_len: () => number;
  __meta_table_size: () => number;
  __err_ptr: () => number;
  __err_len: () => number;
}

interface BuiltinsExports {
  memory: WebAssembly.Memory;
  reset: () => void;
  seed: (seed: number) => void;
  finalize: (root: bigint) => number;
  result_ptr: () => number;
  result_len: () => number;
  version: () => number;
  [k: string]: unknown;
}

export type CompileOutcome =
  | { ok: true; module: WebAssembly.Module; tableSize: number }
  | { ok: false; errors: DecodedCompileError[] };

export type RunOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: DecodedError };

async function toModule(
  asset: BufferSource | WebAssembly.Module,
): Promise<WebAssembly.Module> {
  if (asset instanceof WebAssembly.Module) return asset;
  return await WebAssembly.compile(asset);
}

export class Machine {
  private constructor(
    private readonly compiler: CompilerExports,
    private readonly builtins: BuiltinsExports,
    private readonly table: WebAssembly.Table,
  ) {}

  static async create(assets: NovaAssets): Promise<Machine> {
    const [compilerModule, builtinsModule, shimModule] = await Promise.all([
      toModule(assets.compiler),
      toModule(assets.builtins),
      toModule(assets.shim),
    ]);
    return Machine.fromModules(compilerModule, builtinsModule, shimModule);
  }

  /**
   * Synchronous creation — only usable where synchronous WASM compilation is
   * allowed (Node, workers; NOT browsers' main thread for large modules).
   */
  static createSync(assets: NovaAssets): Machine {
    const toModuleSync = (asset: BufferSource | WebAssembly.Module) =>
      asset instanceof WebAssembly.Module ? asset : new WebAssembly.Module(asset);
    return Machine.fromModules(
      toModuleSync(assets.compiler),
      toModuleSync(assets.builtins),
      toModuleSync(assets.shim),
    );
  }

  private static fromModules(
    compilerModule: WebAssembly.Module,
    builtinsModule: WebAssembly.Module,
    shimModule: WebAssembly.Module,
  ): Machine {
    const table = new WebAssembly.Table({ element: "anyfunc", initial: 1024 });

    const shim = new WebAssembly.Instance(shimModule, { env: { table } });

    const builtins = new WebAssembly.Instance(builtinsModule, {
      env: {
        call_closure: shim.exports["call_closure"] as WebAssembly.ExportValue,
      },
    });
    const builtinsExports = builtins.exports as unknown as BuiltinsExports;

    const compiler = new WebAssembly.Instance(compilerModule, {});
    const compilerExports = compiler.exports as unknown as CompilerExports;

    return new Machine(compilerExports, builtinsExports, table);
  }

  /**
   * Compiles dicexp source to a program module. Synchronous: on browsers'
   * main thread this throws for large sources — run nova in a worker (like
   * the playground does for naive) or keep programs small.
   */
  compileSource(source: string): CompileOutcome {
    this.compiler.__reset();
    const sourceBytes = new TextEncoder().encode(source);
    const ptr = this.compiler.__alloc(sourceBytes.length);
    new Uint8Array(this.compiler.memory.buffer, ptr, sourceBytes.length).set(
      sourceBytes,
    );
    const status = this.compiler.compile(ptr, sourceBytes.length);
    if (status !== 0) {
      const errors = decodeCompileErrors(
        this.compiler.memory.buffer,
        this.compiler.__err_ptr(),
        this.compiler.__err_len(),
      );
      return { ok: false, errors };
    }
    const outBytes = new Uint8Array(this.compiler.__out_len());
    outBytes.set(
      new Uint8Array(
        this.compiler.memory.buffer,
        this.compiler.__out_ptr(),
        outBytes.length,
      ),
    );
    return {
      ok: true,
      module: new WebAssembly.Module(outBytes),
      tableSize: this.compiler.__meta_table_size(),
    };
  }

  /** Runs a compiled program module with a fresh heap and the given seed. */
  runCompiled(program: WebAssembly.Module, tableSize: number, seed: number): RunOutcome {
    this.builtins.reset();
    this.builtins.seed(seed);

    if (tableSize > this.table.length) {
      this.table.grow(tableSize - this.table.length);
    }

    const instance = new WebAssembly.Instance(program, {
      env: { memory: this.builtins.memory, table: this.table },
      // NOTE: `this.builtins` is already the instance's exports object.
      nova_rt: this.builtins as unknown as WebAssembly.ModuleImports,
    });

    const root = (instance.exports["__main"] as () => bigint)();
    const status = this.builtins.finalize(root);
    const outcome = decodeResult(
      this.builtins.memory.buffer,
      this.builtins.result_ptr(),
      this.builtins.result_len(),
    );
    if (status !== 0 && outcome.ok) {
      throw new Error(
        `finalize returned ${status} but the result buffer holds a value`,
      );
    }
    return outcome;
  }
}
