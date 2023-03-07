pre-run: compile-grammar

# https://github.com/casey/just/issues/237#issuecomment-1316617868
priv *args:
  just -f justfile_priv {{args}}

compile-grammar:
  pnpm exec peggy --format=es internal/parsing/parser.pegjs

deno *args: pre-run
  deno {{args}}

run-demo: pre-run
  deno run demo.ts

test: pre-run
  deno test

bench: pre-run
  deno bench

repl: pre-run
  deno run repl.ts

bundle-browser: pre-run
  mkdir -p dist
  ./scripts/bundle.ts mod.ts > dist/browser.min.js