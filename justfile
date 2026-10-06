test-all: test-solid-components test-naive-evaluator-all

# --- nova ---

# wasm-opt (from the `binaryen` npm package; no system install) flags, per
# module — tune here. Override e.g.: `just WASM_OPT_COMPILER_FLAGS="-Oz --converge" build-nova-wasm`
WASM_OPT := "pnpm exec wasm-opt"
# Both flag sets must keep `--enable-bulk-memory-opt`: the rustc-emitted
# modules use memory.copy/memory.fill but carry no target-features section,
# so wasm-opt rejects the input without it. (Engines already run these
# modules, so this changes nothing about the deployment envelope.)
# compiler: runs once per program → optimize for size (-Oz).
WASM_OPT_COMPILER_FLAGS := "-Oz --enable-bulk-memory-opt"
# builtins: evaluation hot path (every builtin call) → optimize for speed
# (-O3); do not shrink it at the cost of runtime speed.
WASM_OPT_BUILTINS_FLAGS := "-O3 --enable-bulk-memory-opt"

build-nova-wasm:
	cd nova && cargo build --release --target wasm32-unknown-unknown -p dicexp-nova-compiler -p dicexp-nova-builtins
	mkdir -p nova/packages/nova/wasm
	cp nova/target/wasm32-unknown-unknown/release/dicexp_nova_compiler.wasm nova/packages/nova/wasm/nova-compiler.wasm
	cp nova/target/wasm32-unknown-unknown/release/dicexp_nova_builtins.wasm nova/packages/nova/wasm/nova-builtins.wasm
	# Optimize in place via temp file (don't overwrite wasm-opt's own input).
	{{WASM_OPT}} {{WASM_OPT_COMPILER_FLAGS}} nova/packages/nova/wasm/nova-compiler.wasm -o nova/packages/nova/wasm/nova-compiler.wasm.opt
	mv nova/packages/nova/wasm/nova-compiler.wasm.opt nova/packages/nova/wasm/nova-compiler.wasm
	{{WASM_OPT}} {{WASM_OPT_BUILTINS_FLAGS}} nova/packages/nova/wasm/nova-builtins.wasm -o nova/packages/nova/wasm/nova-builtins.wasm.opt
	mv nova/packages/nova/wasm/nova-builtins.wasm.opt nova/packages/nova/wasm/nova-builtins.wasm
	# nova-shim.wasm is NOT optimized: it's an ~82-byte hand-minimized module
	# emitted by dicexp-nova-shim-gen — already minimal, nothing for wasm-opt
	# to shrink.
	cd nova && cargo run --release -p dicexp-nova-shim-gen > packages/nova/wasm/nova-shim.wasm

# MEASUREMENT-ONLY compiler variant (not a supported shipping configuration):
# built with `--no-default-features` (the `checkpoints` cargo feature off), so
# it emits NO plan-§3.9 checkpoint guards and omits the `__checkpoint` import —
# the soft timeout silently stops working. For measuring the per-call overhead
# of the checkpoint guard; optimized with the same wasm-opt flags as
# `build-nova-wasm` (WASM_OPT_COMPILER_FLAGS) so measurements compare
# like-for-like.
build-nova-wasm-nockpt:
	cd nova && cargo build --release --target wasm32-unknown-unknown --no-default-features -p dicexp-nova-compiler
	mkdir -p nova/packages/nova/wasm-nockpt
	cp nova/target/wasm32-unknown-unknown/release/dicexp_nova_compiler.wasm nova/packages/nova/wasm-nockpt/nova-compiler.wasm
	{{WASM_OPT}} {{WASM_OPT_COMPILER_FLAGS}} nova/packages/nova/wasm-nockpt/nova-compiler.wasm -o nova/packages/nova/wasm-nockpt/nova-compiler.wasm.opt
	mv nova/packages/nova/wasm-nockpt/nova-compiler.wasm.opt nova/packages/nova/wasm-nockpt/nova-compiler.wasm

nova-wasm-sizes:
	node nova/scripts/wasm-sizes.mjs

test-nova-rust:
	cd nova && cargo test

test-nova: build-nova-wasm test-nova-rust
	cd nova/packages/nova && pnpm run test

build-nova-ts:
	cd nova/packages/nova && pnpm run build
	cd nova/packages/nova-in-worker && pnpm run build

build-nova: build-nova-wasm test-nova-rust test-nova build-nova-ts


publish-interface:
	cd packages/interface && pnpm publish --access public

build-lezer:
	cd internal/lezer && node scripts/compile-lezer.js ./src/dicexp.grammar

prepare-solid-components:
lint-solid-components: prepare-solid-components
	cd packages/solid-components && pnpm run lint
test-solid-components: prepare-solid-components lint-solid-components
	cd packages/solid-components && pnpm run test
build-solid-components: prepare-solid-components test-solid-components
	cd packages/solid-components && pnpm run build
publish-solid-components: build-solid-components
	cd packages/solid-components && pnpm publish --access public

prepare-naive-evaluator: build-lezer
lint-naive-evaluator: prepare-naive-evaluator
	cd packages/naive-evaluator && pnpm run type-check
test-naive-evaluator: prepare-naive-evaluator lint-naive-evaluator
	cd packages/naive-evaluator && pnpm run test
bench-naive-evaluator: prepare-naive-evaluator test-naive-evaluator
	cd packages/naive-evaluator && pnpm run bench
build-naive-evaluator: prepare-naive-evaluator test-naive-evaluator
	cd packages/naive-evaluator && pnpm run build
publish-naive-evaluator: build-naive-evaluator
	cd packages/naive-evaluator && pnpm publish --access public

prepare-naive-evaluator-builtins:
lint-naive-evaluator-builtins: prepare-naive-evaluator-builtins
	cd packages/naive-evaluator-builtins && pnpm run type-check
test-naive-evaluator-builtins: prepare-naive-evaluator-builtins lint-naive-evaluator-builtins
	cd packages/naive-evaluator-builtins && pnpm run test
build-naive-evaluator-builtins: prepare-naive-evaluator-builtins test-naive-evaluator-builtins
	cd packages/naive-evaluator-builtins && pnpm run build
publish-naive-evaluator-builtins: build-naive-evaluator-builtins
	cd packages/naive-evaluator-builtins && pnpm publish --access public

prepare-naive-evaluator-in-worker:
lint-naive-evaluator-in-worker: prepare-naive-evaluator-in-worker
	cd packages/naive-evaluator-in-worker && pnpm run type-check
test-naive-evaluator-in-worker: prepare-naive-evaluator-in-worker lint-naive-evaluator-in-worker
build-naive-evaluator-in-worker: prepare-naive-evaluator-in-worker test-naive-evaluator-in-worker
	cd packages/naive-evaluator-in-worker && pnpm run build
publish-naive-evaluator-in-worker: build-naive-evaluator-in-worker
	cd packages/naive-evaluator-in-worker && pnpm publish --access public

test-naive-evaluator-all: test-naive-evaluator test-naive-evaluator-builtins
build-naive-evaluator-all: build-naive-evaluator build-naive-evaluator-builtins build-naive-evaluator-in-worker
publish-naive-evaluator-all: publish-naive-evaluator publish-naive-evaluator-builtins publish-naive-evaluator-in-worker