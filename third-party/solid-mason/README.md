# solid-mason

- Forked from <https://github.com/lxsmnsyc/solid-mason> (commit f14a9c0).
- Removed the `examples/`, `images/` folders and most part of `README.md` to
  reduce size.
- Removed `pnpm-lock.yaml` and `pnpm-workspace.yaml` in this exact folder, since
  they will be taken over by the outer project. `package.json`, `lerna.json`,
  `.gitignore` and `.eslintrc` in this exact folder are also removed.
- in `paackages/solid-mason`, only `src/`, `package.json`, `tsconfig.json`,
  `LICENSE` and `README.md` are kept.
- `packages/solid-mason/package.json` is rewriten:
  - only `solid-js` is kept as a peer dependency, and `solid-use` as a
    dependency.
  - unnecessray/empty fields are removed.
  - `main` becomes `./src/index.ts`.
  - package name is changed to `@dicexp/third-party-solid-mason`.
- Fixed [issue #2](https://github.com/lxsmnsyc/solid-mason/issues/2) in the way
  discribed by the issuer in the beginning.

-- Umaĵo

---

## License

MIT © [lxsmnsyc](https://github.com/lxsmnsyc)
