nodes *args:
	just -f internal/nodes/justfile {{args}}
lezer *args:
	just -f internal/lezer/justfile {{args}}
parsing-into-node-tree *args:
	just -f internal/parsing-into-node-tree/justfile {{args}}
dicexp *args:
	just -f packages/dicexp/justfile {{args}}
builtins *args:
	just -f packages/builtins/justfile {{args}}
playground *args:
	just -f playground/justfile {{args}}

build-grammar:
	just lezer build

test:
	just parsing-into-node-tree test
	just dicexp test
	just builtins test
	just playground test

build:
	just dicexp build

publish: build
	just dicexp publish-no-build
	just builtins publish-no-build