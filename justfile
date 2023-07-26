nodes *args:
	just -f internal/nodes/justfile {{args}}
lezer *args:
	just -f internal/lezer/justfile {{args}}
dicexp *args:
	just -f packages/dicexp/justfile {{args}}
builtins *args:
	just -f packages/builtins/justfile {{args}}
playground *args:
	just -f playground/justfile {{args}}

build-grammar:
	just lezer build

repl:
	just -f repl/justfile run

repl-no-build:
	just -f repl/justfile run-no-build

test:
	just dicexp test
	just playground test
	just builtins test

build:
	just dicexp build

publish: build
	just dicexp publish-no-build
	just builtins publish-no-build