# Ascua site

Made with [create-ascua](https://ascua.gitweave.run/docs/sitios/).

```sh
npm run dev      # each page rendered on the fly, with reload
npm run build    # dist/: one HTML page per file in src/routes/
```

- `src/routes/`: one file, one page. `_layout.ts` wraps the pages of its folder.
- `src/islands/`: the interactive parts, the only ones that ship JavaScript.

Docs: https://ascua.gitweave.run/docs/
