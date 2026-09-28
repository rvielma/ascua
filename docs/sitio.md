# Sitios: de `src/routes/` a HTML listo para subir

El meta-framework de Ascua. `stil run build` —que es `vite build`— deja
en `dist/` una página HTML por ruta, con sus estilos dentro y el JavaScript
justo para las islas. Nada más que servir archivos: Hull con `serve: static`,
un `tower-http` en Rust o cualquier CDN.

No hay bundler propio ni servidor propio. Es una opción de `vite-plugin-ascua`:

```ts
// vite.config.ts
import ascua from "vite-plugin-ascua";

export default { plugins: [ascua({ site: true })] };
```

## Las fases

| Fase | Qué | Estado |
|---|---|---|
| 1 | **Estático (SSG)**: rutas por archivo, layout, islas, `404`, desarrollo con recarga | hecha |
| 2 | **Datos por ruta**: `load()`, `description`, `notFound()`, rutas que son archivos (`sitemap.xml.ts`), esqueleto propio (`shell`) | hecha |
| 3 | **Servidor Node**: `mode: "server"`, SSR en cada petición, un `index.mjs` con todo dentro | hecha |

El primer usuario es la documentación del propio sitio de Ascua: sus rutas
están en `web/rutas/docs/`, con su esqueleto en `web/docs/esqueleto.html`, y
el índice de búsqueda es una ruta-archivo, `busqueda.js.ts`.

Fuera, a propósito: Server Components, un runtime de servidor y un bundler
propio. El runtime del navegador no cambia: sigue siendo el de 2,25 kB.

## Convenciones

```
index.html              opcional: el esqueleto (shell) de todas las páginas
src/routes/
  _layout.ts            opcional: envuelve todas las páginas
  index.ts              /
  acerca.ts             /acerca
  pedidos/index.ts      /pedidos
  pedidos/[id].ts       /pedidos/:id   (uno por cada id de paths())
  404.ts                404.html
src/islands/*.ts        lo que se hidrata; se registran solas
```

Un archivo que empieza por `_` no es una ruta. `[nombre]` es un segmento
variable, y `[...rest]`, al final, atrapa lo que quede de la URL con sus
barras.

### Una página

```ts
// src/routes/pedidos/[id].ts
import { PEDIDOS } from "../../datos.js";

export const title = ({ id }: { id: string }) => `Pedido ${id}`;

/** Qué páginas generar: una por objeto. Obligatorio en las rutas variables. */
export function paths() {
  return PEDIDOS.map((p) => ({ id: p.id }));
}

export default function Pedido({ id }: { id: string }) {
  return view`<article><h1>Pedido ${id}</h1></article>`;
}
```

- `default`: el componente de la página. Recibe los parámetros como props.
- `title`: una cadena o una función de los parámetros. Va al `<title>`.
- `paths()`: síncrona o asíncrona. Corre al construir.

El código de las páginas **no llega al navegador**: corre al construir y
queda como HTML. Lo interactivo va en islas (`defineIsland`), que la página usa
como cualquier componente.

### El layout

```ts
// src/routes/_layout.ts
import type { Children } from "ascua";

export default function Marco(props: { path: string; children: Children }) {
  const marco = view`<div><header>…</header><main></main></div>`;
  props.children(marco.querySelector("main")!);
  return marco;
}
```

Es un componente con hijos como cualquier otro. Puede haber uno por carpeta:
el de la raíz envuelve al de `pedidos/`, que envuelve a sus páginas.

### El esqueleto

Si hay `index.html` —u otro archivo, con `site: { shell }`—, se usa como esqueleto de cada página: pasa por Vite como
siempre, así que sus `<link>` a hojas globales acaban con su hash. La página
va donde esté `<!--ascua-->`, o al principio de `<body>` si no está. Sin
`index.html`, se usa uno mínimo.

A cada página se le añaden:

- el `<title>`, si la ruta define `title`;
- un `<style>` con los estilos de los componentes que aparecen en ella, y solo
  esos (`collectStyles`);
- **si tiene islas**, el script que las hidrata, la lista de los módulos de
  islas que usa (`<script type="application/json" id="ascua-islands">`) y, por
  delante, un `modulepreload` de sus chunks y sus hojas. Solo viajan los
  módulos de las islas de esa página. Una página sin islas sale sin una línea
  de JavaScript.

## Cómo construye

```mermaid
flowchart TD
    build["vite build"] --> cliente["build del cliente:<br/>index.html + virtual:ascua-site/client"]
    cliente --> guarda["writeBundle: guarda el esqueleto, el script de islas<br/>y los chunks y hojas de cada módulo de islas"]
    guarda --> cierre["closeBundle"]
    cierre --> rutas["descubre src/routes/"]
    rutas --> params["paths() de las rutas variables"]
    params --> render["cada ruta: ssrLoadModule + renderToString"]
    render --> escribe["dist/ruta/index.html<br/>con título, estilos y, si hay islas,<br/>el script y la lista de sus módulos"]
```

- **El cliente** es un módulo virtual con un `import.meta.glob` perezoso de
  `src/islands/`: cada módulo queda en su propio chunk. Lee la lista de la
  página, importa esos módulos, recoge lo que sea una isla y llama a `hydrate`.
- **Qué módulos usa cada página** sale del HTML renderizado: los nombres de
  `data-ascua-island`, y de cada nombre, el módulo que lo define (cargando los
  de `src/islands/` en el servidor). La granularidad es el **módulo**: una isla
  por archivo, y cada página descarga solo las suyas.
- **El prerender** carga las páginas con un servidor de Vite en modo
  middleware, el mismo camino que usa hoy la documentación del sitio de Ascua.
  Así las plantillas pasan por el mismo plugin y `registerStyle` recoge los
  estilos.
- `/` se escribe en `dist/index.html`, `/a/b` en `dist/a/b/index.html` y
  `404.ts` en `dist/404.html`. Busybox `httpd` sirve `a/b/` con su
  `index.html`; para la 404, `E404:/404.html` en su `httpd.conf`.

## En desarrollo

`vite` a secas. Una petición a una ruta se renderiza al vuelo con el mismo
código que el build; tocar una página, el layout o algo que importen recarga el
navegador. Las islas tienen su recarga de siempre.

## Decisiones

- **Una opción del plugin, no un paquete nuevo.** Un proyecto que ya usa
  `vite-plugin-ascua` pasa a sitio con una línea.
- **El prerender con el servidor de Vite y no con un segundo build.** El código
  de las páginas no se publica, así que no gana nada minificado, y se evita
  mantener dos configuraciones.
- **Un script para todas las páginas, y las islas por módulo.** El script es
  el mismo en todo el sitio —el runtime y el cargador, cacheados una vez— y lo
  que cambia de una página a otra es la lista. Hasta vite-plugin-ascua 0.5
  iban todas las islas en un solo script. Sin islas no hay entrada de cliente:
  ni script, ni un trozo de runtime compartido con otras entradas de Vite.
- **`load()` y no datos en el componente.** El componente sigue siendo
  síncrono, como todos en Ascua; lo asíncrono va antes, y su resultado llega
  como props. En el build y con servidor es el mismo código.
- **El servidor con todo dentro** (`ssr.noExternal`). Un `index.mjs` que
  arranca sin `node_modules` es lo más fácil de desplegar en Hull o en un
  contenedor mínimo.
- **`notFound()` es una marca, no una clase.** El servidor lleva su propia
  copia del módulo, y `instanceof` fallaría entre las dos.
- **`paths()` y no rastrear enlaces.** Explícito: lo que se genera es lo
  que la ruta dice, sin adivinar a partir del HTML.
