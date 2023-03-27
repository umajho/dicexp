pre-run:

nodes *args:
	just -f internal/nodes/justfile {{args}}

lezer *args:
	just -f internal/lezer/justfile {{args}}

parsing *args:
	just -f internal/parsing/justfile {{args}}

executing *args:
	just -f internal/executing/justfile {{args}}

dicexp *args:
	just -f packages/dicexp/justfile {{args}}

playground *args:
	just -f playground/justfile {{args}}

repl:
	just -f repl/justfile run

repl-no-build:
	just -f repl/justfile run-no-build

test:
	just parsing test
	just executing test
	just playground lint