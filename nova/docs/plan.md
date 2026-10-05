# nova — Plan & Architecture

> Status: living document. Describes the target architecture of `nova`, the
> compiler-based dicexp implementation, and records design decisions.
> Deviations discovered during implementation are marked with `[DEVIATION]` and
> explained in `compat.md` or in a "Deviations" subsection here.
> **For the release roadmap see [`roadmap.md`](./roadmap.md)** — §8 below is
> the original milestone sketch, superseded by it.

## 0. TL;DR

`nova` compiles dicexp source code to a small WASM module ("program module")
which is linked at instantiation time against a precompiled builtins WASM
module ("builtins module"). Both the compiler and the builtins library are
written in Rust and run as WASM on the web. `nova` aims to be the new de-facto
standard implementation of dicexp, superseding `naive` (see `compat.md` for
deliberate divergences).

## 1. Layout

```
nova/
  Cargo.toml                  # cargo workspace
  crates/
    nova-abi/                 # dicexp-nova-abi: shared spec — value tagging,
                              # builtin ids/names, error keys, wire formats
    nova-compiler/            # dicexp-nova-compiler: parser + codegen + WASM
                              # emission. Targets wasm32 (cdylib) and native.
    nova-builtins/            # dicexp-nova-builtins: runtime + builtins,
                              # precompiled to builtins.wasm (cdylib)
  packages/
    nova/                     # @dicexp/nova: TS wrapper implementing
                              # @dicexp/interface's Evaluator; ships the two
                              # .wasm assets; localizes errors.
    nova-in-worker/           # @dicexp/nova-in-worker: worker server +
                              # manager (heartbeat, hard-timeout terminate/
                              # recreate, sampling channel), mirroring
                              # @dicexp/naive-evaluator-in-worker
  docs/
    plan.md                   # this file
    compat.md                 # deliberate divergences from naive + TODO list
```

External touch points: `pnpm-workspace.yaml` (adds `nova/packages/*`), root
`justfile` (`build-nova*` recipes), root README (folder structure), playground
(implementation selector — added in v0.2, see §7.1).

## 2. Architecture overview

```
dicexp source ──► nova-compiler.wasm ──► program.wasm ──imports──► builtins.wasm
                  (parser + codegen +       (per evaluation)      (precompiled,
                   WASM emission)                                shipped asset)
                        ▲                          │
                  JS glue (@dicexp/nova) ◄─────────┘
                  I.Evaluator; browser/Node WebAssembly
```

- **Two modules, linked at instantiation via imports.** No WASM toolchain is
  embedded in the compiler; it only *emits* WASM (`wasm-encoder` crate).
- **Parser is in the compiler** (hand-written recursive descent, ported from
  the Lezer grammar). The compiler API is
  `compile(source) -> { wasm_bytes, table_size } | CompileError`.
- **builtins.wasm owns everything value-related**: the heap, values, thunks,
  sequences, RNG, error objects, and all builtin implementations.
- **Closures live in a shared `WebAssembly.Table`** created by JS and imported
  by both modules; builtins call compiled closures via `call_indirect`.
- **repr (step display) is out of scope for v1**, but builtins code routes
  call paths through no-op trace hook points so repr can be retrofitted
  (event-based, not stack-based — required for TCO compatibility). The
  playground shows an "unavailable under nova" notice instead.

## 3. ABI (v0.1)

The ABI is the contract between program modules (emitted by the compiler) and
the builtins module. `nova-abi` encodes it in Rust types/constants shared by
both crates; this section is the prose source of truth.

### 3.1 Values (`Value`, u64)

Low 2 bits are the tag:

| tag bits | meaning   | encoding                                            |
|----------|-----------|-----------------------------------------------------|
| `00`     | integer   | `(v << 2) \| 0`; `v` is a signed 61-bit (we restrict dicexp integers to ±(2^53−1)) |
| `01`     | boolean   | `(b << 2) \| 1`, `b ∈ {0, 1}`                        |
| `10`     | heap ref  | `(byte_offset << 2) \| 2`; offset into builtins linear memory |

Heap objects are 8-byte aligned. Header: `{ kind: u8, flags: u8, _reserved: u16,
len: u32 }`, payload follows. Kinds:

| kind | payload |
|------|---------|
| THUNK (1)    | `{ state: u8, fnidx: u32, env: ptr, result: u64 }` — state: 0 unevaluated, 2 done, 3 error |
| CLOSURE (2)  | `{ fnidx: u32, env: ptr, arity: u32 }` — a callable |
| CAPTURE (3)  | `{ builtin_id: u32, arity: u32 }` — a callable referring to a builtin |
| ENV (4)      | `{ parent: ptr(0 none), slots: [u64; len] }` |
| LIST (5)     | `{ elems: [u64; len] }` — elements are value handles (usually thunks) |
| ERROR (6)    | `{ key: u32, params: ptr }` — params: `{ count: u32, items: [Param; count] }` |
| STRING (7)   | `{ utf8: [u8; len] }` |
| SEQUENCE (8) | stream object (see §3.5); `flags & 1` = is `sequence$sum` |

`Param` = `{ tag: u8, payload: u64 }`; tag: 0 = int (i64), 1 = string (heap ptr
to STRING), 2 = value-type enum (u8 in payload), 3 = value-type set (bitmask u8
in payload). Value-type enum mirrors naive's `ValueTypeName`:
0 integer, 1 boolean, 2 list, 3 callable, 4 sequence, 5 sequence$sum.

### 3.2 Heap & memory

- Builtins module declares and **exports** its memory, with a declared maximum
  page count (hard memory limit, engine-enforced; default 4096 pages = 256 MiB).
- Bump allocator; `nova_rt_reset()` rewinds the bump pointer (per evaluation).
- Allocation failure raises a structured error (`error.memoryLimitExceeded`)
  instead of trapping.

### 3.3 Shared table & the closure-call shim

JS creates `new WebAssembly.Table({ element: "anyfunc", initial: 1024 })` once
per builtins instance and grows it on demand to the compiler-reported
`table_size`. The program module imports it as `env.table` (emitted by our own
compiler — table imports are trivial to emit) and populates slots
`0..table_size` via element segments (overwriting any previous program's
entries — stale entries are never called).

All compiled functions share one WASM type:
`$clo = (func (param i32 i32 i32) (result i64))` — `(env_ptr, args_ptr, argc)`.
Thunk bodies ignore `args_ptr`/`argc`.

**The builtins module cannot import a table**: rustc/LLVM has no stable way to
declare table imports or exports. Instead, builtins imports a regular function
`env.call_closure(fnidx, env, args_ptr, argc) -> i64`, implemented by a tiny
hand-emitted **shim module** (`crates/nova-shim-gen` generates
`nova-shim.wasm` at build time) that imports `env.table` and performs the
`call_indirect`. Wiring order per evaluator: instantiate shim → instantiate
builtins (`env.call_closure = shim.exports.call_closure`) → per evaluation:
grow table, instantiate program (`env.table`, `env.memory`, `nova_rt.*` =
builtins exports), run. The extra hop is a pure WASM-to-WASM indirect call —
no JS in the loop.

### 3.4 Program module shape

- Imports: `env.memory`, `env.table`, and from module `nova_rt` the runtime
  functions (below) plus exactly the builtins it uses (named imports — the
  import list is the tree-shaking story).
- Exports: `__main() -> i64` (returns the root value handle).
- One WASM function per thunk body / closure body, placed in the table.
- Const pool: one mutable i64 global per hoisted constant; `__main`'s prologue
  initializes each with `nova_rt_thunk_new(fnidx, 0)`. (Const hoisting is
  implemented in a later iteration; mechanism reserved. See §8.)
- No data section except for strings embedded in error paths (v0.1: none —
  compile errors carry identifiers via params from the compiler side instead).

### 3.5 Runtime imports (module `nova_rt`)

| function | signature | notes |
|----------|-----------|-------|
| `thunk_new`   | `(i32 fnidx, i32 env) -> i64` | allocate unevaluated thunk |
| `force`       | `(i64 v) -> i64` | iterative trampoline; memoizes; returns value or ERROR handle |
| `closure_new` | `(i32 fnidx, i32 env, i32 arity) -> i64` | |
| `capture_new` | `(i32 builtin_id, i32 arity) -> i64` | |
| `env_new`     | `(i32 parent, i32 count) -> i32` | env ptr; caller stores slots |
| `list_new`    | `(i32 capacity) -> i32` | list ptr; caller stores elems |
| `args_buf`    | `() -> i32` | scratch buffer (64 slots) for value-call args; copy-on-entry convention |
| `call_callable` | `(i64 callable, i32 args_ptr, i32 argc) -> i64` | forces callable, checks arity, dispatches closure (call_indirect) or capture |
| `repeat`      | `(i64 count, i64 closure) -> i64` | `#`; forces count eagerly; returns SEQUENCE |
| `seed`        | `(i32 seed) -> ()` | seed RNG (per evaluation) |
| `reset`       | `() -> ()` | rewind heap; called by JS before each evaluation |
| `finalize`    | `(i64 root) -> i32` | deep-force root; writes result buffer; 0 ok, 1 error |
| `result_ptr` / `result_len` | `() -> i32` | result buffer location |
| `version`     | `() -> i32` | ABI/builtins version |

Builtins proper are imported by mangled name, e.g. `nova_rt.op_add_2`,
`nova_rt.bf_map_2`. Signature: one i64 param per declared parameter (all value
handles, usually unevaluated thunks) `-> i64`. Mangle table lives in
`nova-abi` (`op_add_2`, `op_sub_2`, `op_neg_1`, `op_pos_1`, `op_mul_2`,
`op_div_2` (//), `op_mod_2`, `op_pow_2`, `op_eq_2`, `op_ne_2`, `op_lt_2`,
`op_gt_2`, `op_le_2`, `op_ge_2`, `op_and_2`, `op_or_2`, `op_not_1`, `op_d_1`,
`op_d_2`, `op_range_1`, `op_range_2`, `bf_reroll_2`, `bf_explode_2`,
`bf_count_2`, `bf_sum_1`, `bf_product_1`, `bf_any_1`, `bf_sort_1`,
`bf_append_2`, `bf_at_2`, `bf_map_2`, `bf_filter_2`, `bf_head_1`, `bf_tail_1`,
`bf_zip_2`, `bf_zipWith_3`). Each also has a numeric builtin id (for captures);
id table in `nova-abi`.

### 3.6 Result wire format

`finalize` deep-forces the root (sequences cast: `$sum` → sum, others → list;
final result must be integer/boolean/nested list, else `badFinalResult`) and
writes a binary encoding into the result buffer:

```
value  := 0x00 i64le           ; integer
        |  0x01 u8             ; boolean
        |  0x02 u32le value*   ; list
error  := 0x03 u32le(key) u32le(count) param*
param  := tag u8, then: tag=0 → i64le | tag=1 → u32le(len) utf8 | tag=2|3 → u8
```

### 3.7 Errors & i18n

Errors are structured `{ key: u32, params }` everywhere (no message strings in
WASM). Keys are an enum in `nova-abi`; the JS wrapper localizes
(key + params → message). The default zh locale reproduces naive's exact
strings; locale plumbing lives in `@dicexp/nova`.

Compile-time errors (parse + semantic) use the same key/params scheme plus a
source span `{ start: u32, end: u32 }`.

### 3.8 Host imports

- Shim module: imports `env.table` (JS-created funcref table).
- Builtins module: imports `env.call_closure` (from the shim, §3.3). Later:
  `env.now() -> f64` for the soft timeout (the checkpoint mechanism is
  designed to also carry call-count fuel and chunked-expensive-op checks —
  see issue #3).
- Program module: imports `env.memory`, `env.table`, `nova_rt.*`.

The builtins allocator is a custom bump `#[global_allocator]` starting at the
linker's `__heap_base`, growing linear memory on demand; `reset()` rewinds it.
Rust collections may churn memory on realloc — acceptable for short-lived
evaluations; the engine-enforced max memory caps the worst case. No panics on
wasm paths (panic = abort = trap); fallible operations return structured
errors.

## 4. Semantics model (what the compiler emits)

- **Everything is lazy by construction**: every call argument and every list
  element is a thunk. Builtins force arguments according to their declaration
  (eager unless `$lazy`); list elements are forced on demand.
- **Thunks memoize** (named-value pinning semantics) and **force is an
  iterative loop**: when a forced thunk's body returns another unevaluated
  thunk, `force` follows the chain in a loop (trampolined TCO; WASM stack
  stays bounded. Closes issue #2).
- **Errors are values**: builtins return ERROR handles; argument errors
  propagate as "indirect" errors (naive distinction preserved where
  observable).
- **Compiled code never forces** except via builtins (`force`, `repeat`,
  `call_callable`, `finalize`).
- **Lexical addressing**: variable reference = `(depth, slot)`; closure
  prologue copies args from `args_ptr` into a fresh ENV whose parent is the
  captured env. Envs capture whole chains (finer-grained capture sets are a
  later optimization).
- **Short-circuiting `and`/`or`**: implemented in builtins with a `$lazy`
  second parameter (divergence from naive, deliberate — see compat.md).
- **Sequences**: lazy pull-streams with per-position memoization (issue #20),
  nominal vs actual lengths; implicit casts on unwrap (`sequence$sum` → sum,
  `sequence` → list). Display-only fragment decorations from naive are
  dropped (repr is out of scope).
- **RNG**: exact port of naive's xorshift7 (incl. seed mixing) and its
  unbiased rejection-sampling `integer(lower, upper)` — same seed ⇒ same
  stream as naive. Enables seeded differential testing and replay-by-seed.

## 5. Parser port (Rust, recursive descent)

Targets the **current** Lezer grammar behavior:

- Full-width → half-width normalization (before tokenizing).
- Integer literals with `_` separators; `3d10`/`d100` dice lexing with the
  contextual `d` tokenizer behavior (including the #12 regression case
  `(d1_000_000_000)`); `d` operands restricted per grammar; `d%` rejected.
- Operator precedence exactly as `precedence-table.ts`; `and`/`or`/`not`;
  `~` prefix/infix; `#`; `|>` (desugared to a regular call, as
  `transformer.ts` does); value calls `.()`; trailing-closure call forms;
  captures `&name/arity` (`#`, `|>` not capturable); `**`/`^` both parse to
  `**/2` (the alias resolution happens at scope level in naive; in nova it is
  a compile-time alias — identical observable behavior).
- Identifiers: Unicode TR31 (`unicode-ident` crate; pin Unicode version and
  differential-test the lexer against naive), optional trailing `?`;
  `$x` params, `_` ignored params, `@x`/`@@x`/`@_x` external tokens (parsed;
  v0.1: compile error "unknown variable", matching naive's behavior for
  unknown identifiers — but eagerly, see compat.md).
- Friendly parse error for `/` ("did you mean `//`"), i18n keys + spans.
- Compile-time semantic checks: unknown regular function, unknown variable,
  duplicate closure parameters — all reported at compile time (naive parity
  or deliberate divergence per compat.md).

## 6. The builtins crate

- Value model + heap + thunks + envs + sequences per §3.
- All 21 operator and 15 function implementations (v0.1 may defer
  `reroll`/`explode` — see §8), with naive-exact behavior except deliberate
  divergences (compat.md): i64 `//` and `%` (no 32-bit truncation),
  short-circuiting `and`/`or`, `sum([]) = 0`, `product([]) = 1`.
- ±(2^53−1) range checks on integer-returning operations
  (`error.limitationExceeded.{maxSafeInteger,minSafeInteger}`).
- RNG per §4. Trace hooks: no-op macro points at call enter/exit (compiled
  out; zero-cost when disabled — required by batch mode, issue #21).

## 7. The JS wrapper (`@dicexp/nova`)

- Loads compiler.wasm (lazy singleton) and builtins.wasm (one instance per
  evaluator; `reset` per evaluation; shared table grown on demand).
- `evaluate(code, opts)`: compile → instantiate → seed → run → finalize →
  decode → localize. Result mapped to `I.EvaluationResult`; parse and compile
  errors become `["error", "parse", …]`.
- `makeEvaluationGenerator`: seeds 0, 1, 2, …
- `ExecutionAppendix.representation`: repr unavailable — interface extension
  or stub decided at playground-integration time (documented in compat.md).
- Locale: default zh table reproducing naive's messages incl. type display
  names; keys from `nova-abi`.

### 7.1 WASM asset strategy for vite (decided in v0.2)

The three `.wasm` artifacts ship inside `@dicexp/nova/wasm/` (gitignored,
produced by `just build-nova-wasm`) and are exposed through the package
exports map (`"./wasm/*"`). Consumers do **not** get bytes from the package
itself; the *worker entry* imports URLs via vite's explicit `?url` suffix:

```ts
import compilerUrl from "@dicexp/nova/wasm/nova-compiler.wasm?url";
```

The bytes are fetched and the modules compiled/instantiated **inside the
Web Worker** (async `createEvaluator` path — main-thread sync-compile
limits never apply). Rationale: no base64 inlining (no ~33% size bloat, no
main-thread parse cost), dev and build use the same mechanism (vite emits
hashed asset URLs in build, serves from disk in dev), and the playground's
main bundle never carries the WASM. Like naive's wrapper, the playground
consumes `@dicexp/nova/internal` (raw TS sources), so no `tsup` pre-build
is needed for playground dev — but `just build-nova-wasm` must have run
(playground's `just prepare` does this).

`@dicexp/nova-in-worker` mirrors `@dicexp/naive-evaluator-in-worker`'s
protocol (handshake, heartbeat, hard-timeout terminate/recreate, sampling
channel). Deliberate deviations from naive's worker: the evaluator is
created **once** at `initialize` (the maker may be async — WASM fetching)
and reused for all requests (safe: reset + re-seed per evaluation); no
`topLevelScope` (builtins are linked, not scoped); the dead
`update_evaluator_options` message type is dropped; evaluator options are
an empty reserved struct (nova's RNG is built in).

## 8. Milestones

1. Docs + scaffolding + ABI skeleton (this commit set).
2. `evaluate("42")` end-to-end (compiler emits trivial module; builtins
   minimal; JS glue runs it in Node).
3. Parser port → parse-error conformance.
4. Core runtime: values, thunks, ops, error keys → basic evaluation green.
5. Lists, HOFs, value calls, captures, closures (lexical addressing).
6. Sequences (`d`, `~`, `#`), RNG, casts.
7. Conformance hardening: limitation checks, laziness edges, shared test
   suites extracted so naive and nova both run them with per-impl divergence
   tags (`it.skipIf` / per-row expectations), kept in sync with compat.md.
8. `reroll`/`explode` (sequence transformers), soft timeout
   (`__checkpoint` + `env.now`).
9. Benchmarks vs naive; playground selector + repr-unavailable UI; worker
   package.
10. Const-pool hoisting (§3.4), finer capture sets, binary-size pass
    (wasm-opt), static-linking/tree-shaking evaluation.

Deferred with mechanism reserved: const-pool hoisting, trace hooks (repr),
fuel-based limits, labeled/keyword args (ABI reservation — issue #17),
external-variable static extraction (issue #7), feature flags (issue #24),
future value kinds (strings/maps/tuples — kind byte has room).

## 9. Testing strategy

- **Conformance**: naive's semantic test suites extracted into shared
  factories consumed by both implementations; divergence tags mirror
  compat.md. vitest `it.skipIf`/`describe.runIf` for impl-specific tests.
- **Seeded differential testing**: same program + same seed ⇒ identical
  results in naive and nova (on the agreed-compatible subset), enabled by the
  exact RNG port.
- **Lexer differential tests**: Unicode-identifier edge cases vs naive.
- **Benchmarks**: port `execute.bench.ts` workloads.
