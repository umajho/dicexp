pre-run: compile-grammar

# https://github.com/casey/just/issues/237#issuecomment-1316617868
priv *args:
  just -f justfile_priv {{args}}

compile-grammar:
  ./scripts/compile-lezer.ts internal/parsing/dicexp.grammar

deno *args: pre-run
  deno {{args}}

run-demo: pre-run
  deno run demo.ts

test: pre-run
  # 由于莫名其妙的原因，Deno 内部出现了各种 “Duplicate identifier” 错误，
  # checkout (stash push --include-untracked) 到先前也无济于事。
  deno test --no-check

bench: pre-run
  deno bench

repl: pre-run
  deno run repl.ts

bundle-browser: pre-run
  mkdir -p dist
  ./scripts/bundle.ts mod.ts > dist/browser.min.js