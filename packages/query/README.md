# ascua-query

Datos remotos para [Ascua](https://ascua.gitweave.run) en **2,15 kB** gzip: una
caché compartida por clave encima de los signals del runtime. Dos vistas que
piden lo mismo hacen una sola petición; una mutación invalida lo que cambió y
todo lo que lo muestra se recarga.

```sh
stil add ascua-query      # o npm install ascua-query
```

```ts
import { invalidate, mutation, remote } from "ascua-query";

const filters = signal({ status: "open", page: 1 });

const conversations = remote({
  key: () => ["conversations", filters()],          // reactiva: cambia, recarga
  load: ([, f], { signal }) => api.conversations(f, { signal }),
  keepPrevious: true,                               // sin pantalla en blanco al paginar
  interval: 15_000,                                 // sondeo, solo con la pestaña visible
});

const create = mutation({
  run: (data: NewUser) => api.createUser(data),
  onSuccess: () => invalidate(["users"]),           // `pending()` espera a la recarga
});

view`
  <Show when=${() => conversations()}>${(c) => view`<Table rows=${c}/>`}</Show>
  <button disabled=${() => create.pending()} onclick=${() => create.mutate(form())}>Create</button>`;
```

Sin contexto ni proveedor que instalar, como el router: la caché es del
módulo. Una consulta se suscribe mientras vive el scope en que se creó; al
cerrar la vista la suelta, y lo que nadie mira se borra pasado `gcTime`.

## Lo que hay

| | |
|---|---|
| `remote({ key, load, … })` | Una consulta. Se lee llamándola; `state()`, `loading()`, `error()`, `placeholder()`, `updatedAt()`, `reload()`. |
| `mutation({ run, onMutate, onSuccess, onError, onSettled })` | Una escritura: `mutate(v, { onSuccess, onError })`, `mutateAsync()`, `state()`, `pending()`, `data()`, `error()`, `reset()`. |
| `invalidate(prefix?)` | Caduca lo que empieza por `prefix`; lo que se está mirando, se recarga ya. |
| `setData(key, value \| (old) => next)` / `getData(key)` | Leer y escribir la caché a mano: actualizaciones optimistas. |
| `cancel(prefix?)` | Corta las cargas en camino, para que no pisen una escritura optimista. |
| `prefetch(key, load)` | Cargar antes de que una vista lo pida. |
| `configure({ staleTime, gcTime, retry, retryDelay, refetchOnFocus })` | Valores por defecto de todas las consultas. |
| `clearCache()` | Vaciarla: tests y cierres de sesión. |

Los valores por defecto son los de TanStack Query, para que migrar no cambie
el comportamiento: `staleTime: 0`, `gcTime` de cinco minutos, tres reintentos
con espera creciente y recarga al volver a la pestaña o a la red.

Lo que no hay que escribir a mano:

- **Deduplicación.** Mientras una clave está cargando, quien la pida espera
  esa misma carga.
- **Una respuesta vieja nunca pisa a una nueva.** Una recarga aborta la
  anterior (el `signal` que recibe `load` se dispara) y descarta su respuesta.
- **Un sondeo que trae lo mismo no repinta nada.** Lo nuevo reusa cada objeto
  de lo anterior que no cambió: con un `<For>` con clave, solo se toca la
  fila que cambió.
- **La clave es reactiva.** `key: () => id() ? ["messages", id()] : null`: con
  `null` la consulta queda en `idle`, igual que un `resource`.

`remote` se llama así, y no `query`, porque `ascua-router` ya exporta
`query()` —los parámetros de la URL— y una vista de lista suele usar los dos.
