nodes *args:
	just -f internal/nodes/justfile {{args}}
lezer *args:
	just -f internal/lezer/justfile {{args}}
dicexp *args:
	just -f packages/naive-evaluator/justfile {{args}}
builtins *args:
	just -f packages/naive-evaluator-builtins/justfile {{args}}
playground *args:
	just -f playground/justfile {{args}}

build-grammar:
	just lezer build

test:
	just dicexp test
	just builtins test
	just playground test

build:
	just dicexp build

publish: build
	just dicexp publish-no-build
	just builtins publish-no-build