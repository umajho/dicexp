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
  /**
   * Arm the soft timeout (plan §3.9): f64 deadline (ms since the Unix epoch)
   * + i32 limit — both map to JS `number`. `reset()` disarms.
   */
  set_soft_timeout: (deadlineEpochMs: number, limitMs: number) => void;
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

/**
 * A program module linked into the machine's shared table, ready for
 * repeated `runPrepared` runs (v0.6 instance reuse, plan.md §7): the
 * per-sample `new WebAssembly.Instance` cost dominated trivial programs
 * (benchmarks.md: nova 0.52× naive on `d6`). Opaque handle — everything
 * but `module`/`tableSize` is managed by the owning `Machine`.
 */
export class PreparedProgram {
  /** The live instance; replaced whenever the shared table is re-bound. */
  instance!: WebAssembly.Instance;
  /**
   * `tableEpoch` value recorded at this handle's last instantiation.
   * Stale (≠ the machine's current epoch) ⇒ another program has
   * overwritten the shared table's slots and this instance must not be
   * called (see `Machine.runPrepared`).
   */
  epoch = -1;
  constructor(
    /** The compiled program module (re-instantiated on invalidation). */
    readonly module: WebAssembly.Module,
    /** Compiler-reported table size (plan.md §3.3); the table's floor. */
    readonly tableSize: number,
  ) {}
}

async function toModule(
  asset: BufferSource | WebAssembly.Module,
): Promise<WebAssembly.Module> {
  if (asset instanceof WebAssembly.Module) return asset;
  return await WebAssembly.compile(asset);
}

export class Machine {
  /**
   * Monotonic counter bumped on EVERY program instantiation into the
   * shared table. Program modules populate slots `0..table_size` via
   * active element segments at instantiation (plan.md §3.3), overwriting
   * whatever a previous program put there — so only the most recently
   * instantiated program's instance may call through the table. Each
   * `PreparedProgram` records the epoch it was instantiated under and is
   * re-instantiated before running whenever the epochs diverge, which
   * keeps interleaved use (e.g. an `evaluate` of program A between two
   * pulls of a prepared generator for program B) safe.
   */
  private tableEpoch = 0;

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
        // Host clock for the checkpoint channel (plan §3.8/§3.9); never
        // called while no restriction is armed.
        now: () => Date.now(),
      },
    });
    const builtinsExports = builtins.exports as unknown as BuiltinsExports;

    // ABI version guard (mirrors `abi::ABI_VERSION` in nova-abi): the program
    // modules the compiler emits are only linkable against the builtins
    // version they were built for (imports/exports drift silently otherwise).
    if (builtinsExports.version() !== 2) {
      throw new Error(
        `nova builtins ABI version mismatch (expected 2, got ${builtinsExports.version()}) — stale wasm assets? run \`just build-nova-wasm\``,
      );
    }

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

  /**
   * Links a compiled program module into the shared table ONCE and returns
   * a handle for repeated `runPrepared` runs. Grows the table if needed
   * (the program's `env.table` import demands `tableSize` slots) and bumps
   * `tableEpoch`, invalidating every previously prepared program.
   */
  prepareProgram(
    module: WebAssembly.Module,
    tableSize: number,
  ): PreparedProgram {
    const prepared = new PreparedProgram(module, tableSize);
    this.bindProgram(prepared);
    return prepared;
  }

  /**
   * Runs a prepared program with a fresh heap and the given seed — the
   * per-run sequence of `runCompiled` minus instantiation. Re-instantiates
   * first if the shared table was re-bound by another program since this
   * handle's last run (the `tableEpoch` check above).
   *
   * Why reusing one instance across runs is safe (no cross-run state
   * survives into the next run):
   * - Program modules hold no mutable state of their own: today they have
   *   no globals at all (plan.md §3.4 — the const pool is a later v0.6
   *   item, and its design already re-initializes every global in
   *   `__main`'s prologue, keeping reuse safe when it lands).
   * - The heap is rewound by `reset()` (plan.md §3.2) before every run.
   * - The RNG is re-seeded per run (`seed`), so same seed ⇒ same stream.
   * - `reset()` also disarms the soft timeout; it is re-armed below only
   *   when this run requests one (plan.md §3.9).
   * - `finalize` writes a fresh result buffer per run before we decode it.
   */
  runPrepared(
    prepared: PreparedProgram,
    seed: number,
    restrictions?: { softTimeoutMs?: number },
  ): RunOutcome {
    if (prepared.epoch !== this.tableEpoch) {
      this.bindProgram(prepared);
    }

    this.builtins.reset();
    this.builtins.seed(seed);
    if (restrictions?.softTimeoutMs !== undefined) {
      this.builtins.set_soft_timeout(
        Date.now() + restrictions.softTimeoutMs,
        restrictions.softTimeoutMs,
      );
    }

    const root = (prepared.instance.exports["__main"] as () => bigint)();
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

  /**
   * Runs a compiled program module with a fresh heap and the given seed.
   * `restrictions.softTimeoutMs`, when given, arms the soft timeout
   * (plan §3.9): checkpoints fire on the first call forced after
   * `Date.now() + softTimeoutMs`.
   *
   * One-shot path (no reuse): prepare + run. Instantiation order relative
   * to reset/seed/arm is immaterial — instantiation touches only the
   * shared table (element segments; program modules have no start
   * function, data sections, or globals), which none of those affect.
   */
  runCompiled(
    program: WebAssembly.Module,
    tableSize: number,
    seed: number,
    restrictions?: { softTimeoutMs?: number },
  ): RunOutcome {
    return this.runPrepared(
      this.prepareProgram(program, tableSize),
      seed,
      restrictions,
    );
  }

  /**
   * Instantiates `prepared.module` into the shared table (growing it to
   * `tableSize` first if needed — the import's minimum demands it) and
   * records the new epoch on the handle.
   */
  private bindProgram(prepared: PreparedProgram): void {
    if (prepared.tableSize > this.table.length) {
      this.table.grow(prepared.tableSize - this.table.length);
    }
    prepared.instance = new WebAssembly.Instance(prepared.module, {
      env: { memory: this.builtins.memory, table: this.table },
      // NOTE: `this.builtins` is already the instance's exports object.
      nova_rt: this.builtins as unknown as WebAssembly.ModuleImports,
    });
    this.tableEpoch += 1;
    prepared.epoch = this.tableEpoch;
  }
}
