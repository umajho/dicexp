test-all: test-solid-components test-naive-evaluator-all

# --- nova ---

build-nova-wasm:
	cd nova && cargo build --release --target wasm32-unknown-unknown -p dicexp-nova-compiler -p dicexp-nova-builtins
	mkdir -p nova/packages/nova/wasm
	cp nova/target/wasm32-unknown-unknown/release/dicexp_nova_compiler.wasm nova/packages/nova/wasm/nova-compiler.wasm
	cp nova/target/wasm32-unknown-unknown/release/dicexp_nova_builtins.wasm nova/packages/nova/wasm/nova-builtins.wasm
	cd nova && cargo run --release -p dicexp-nova-shim-gen > packages/nova/wasm/nova-shim.wasm

test-nova-rust:
	cd nova && cargo test

test-nova: build-nova-wasm test-nova-rust
	cd nova/packages/nova && pnpm run test

build-nova-ts:
	cd nova/packages/nova && pnpm run build

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