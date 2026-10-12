# Ascua site

Made with [create-ascua](https://ascua.gitweave.run/docs/sitios/), with a server.

```sh
npm run dev      # each page rendered on the fly, with reload
npm run build    # dist/client and dist/server
npm start        # node dist/server/index.mjs (PORT=3000)
```

The same build runs with `bun dist/server/index.mjs` or
`deno run -A dist/server/index.mjs`, and `dist/server/worker.mjs` runs on
Cloudflare Workers or workerd.

- `src/routes/`: one file, one page. `_layout.ts` wraps, `_middleware.ts` runs first.
- `src/routes/contact.ts`: a form with an action, validated on the server.
- `src/islands/`: the interactive parts, the only ones that ship JavaScript.

Signed cookies need `ASCUA_SECRET` (32 characters or more) in the environment.

Docs: https://ascua.gitweave.run/docs/
