pre-run: bundle-grammar

# https://github.com/casey/just/issues/237#issuecomment-1316617868
priv *args:
  just -f justfile_priv {{args}}

bundle-grammar:
  cat internal/parsing/grammar.ohm | ./scripts/input-to-json-string.ts > internal/parsing/grammar.json

run-demo: pre-run
  deno run demo.ts

test: pre-run
  deno test

bench: pre-run
  deno bench