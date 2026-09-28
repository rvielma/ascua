# Un sitio estático con Ascua

Cada archivo de `src/routes/` es una página. `stil run build` las deja todas en
`dist/` como HTML —17 aquí: el inicio, la lista, una por lenguaje y la 404— y
solo las que tienen islas llevan JavaScript.

```sh
stil install
stil run dev       # http://localhost:5173, cada página renderizada al vuelo
stil run build     # dist/, listo para subir a cualquier servidor de archivos
stil run check
```

No hay `servidor.js` ni entradas de cliente y servidor escritas a mano: todo
eso lo pone `ascua({ site: true })` en `vite.config.ts`. Compáralo con
[`../ssr-ts`](../ssr-ts), que hace lo mismo con un servidor Node propio.

| Archivo | Página |
|---|---|
| `src/routes/index.ts` | `/`, con el contador como isla |
| `src/routes/lenguajes/index.ts` | `/lenguajes`, con el buscador como isla |
| `src/routes/lenguajes/[lenguaje].ts` | `/lenguajes/rust`, … una por lenguaje, sin JavaScript |
| `src/routes/404.ts` | `404.html` |
| `src/routes/_layout.ts` | el marco de todas |

El diseño está en [`docs/sitio.md`](../../docs/sitio.md).
