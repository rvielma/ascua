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
| 4 | **Formularios y seguridad**: `actions`, `redirect`, `fail`, `validate`; CSP con hashes, cabeceras, cookies firmadas y origen comprobado | hecha |

El primer usuario es la documentación del propio sitio de Ascua: sus rutas
están en `web/rutas/docs/`, con su esqueleto en `web/docs/esqueleto.html`, y
el índice de búsqueda es una ruta-archivo, `busqueda.js.ts`.

Fuera, a propósito: Server Components, un runtime de servidor y un bundler
propio. El runtime del navegador no cambia: sigue siendo el de 3,62 kB.

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

## Formularios: `actions`

Una ruta recibe los `POST` de sus formularios exportando `actions`. Es un
`<form method="post">` de HTML: funciona sin una línea de JavaScript, y el
navegador hace lo que sabe hacer —enviar, seguir la redirección, volver
atrás—. Necesita servidor (`mode: "server"`); un sitio estático con acciones
no se construye, para que un formulario no se pierda en silencio.

```ts
// src/routes/orders/new.ts
import { fail, field, fields, redirect, validate, type ActionContext, type FormResult } from "vite-plugin-ascua/site";

const Order = fields({
  product: field.text({ max: 80 }),
  quantity: field.number({ min: 1, integer: true }),
  urgent: field.checkbox(),
});

export const actions = {
  async default({ formData }: ActionContext) {
    const result = await validate(Order, formData);
    if (!result.ok) return fail(400, result);
    const id = await saveOrder(result.data);
    throw redirect(`/orders/${id}`);
  },
};

export default function NewOrder({ form }: { form?: FormResult<typeof Order> }) {
  const errors = form?.ok === false ? form.errors : {};
  const values = form?.ok === false ? form.values : {};
  return view`
    <form method="post">
      <input name="product" value=${String(values.product ?? "")}>
      <p class="error">${errors.product ?? ""}</p>
      …
    </form>`;
}
```

- **`default`** atiende `<form method="post">`; cualquier otra, un formulario
  con `action="?/nombre"`. Recibe `{ params, url, request, cookies, formData }`.
- **`redirect(url)`**, devuelto o lanzado, responde con un **303**: el
  navegador pide la página nueva con GET y recargarla no reenvía el
  formulario. Es lo normal tras guardar.
- **`fail(status, datos)`** vuelve a pintar la página con ese código y los
  datos en la prop **`form`**. Lo que devuelva la acción sin `fail` también
  llega en `form`, con un 200. Después de la acción corre `load()`, así que la
  página ya ve lo que se guardó.
- **`validate(esquema, formData)`** acepta cualquier Standard Schema. Si no
  vale, devuelve `errors` —el primer mensaje de cada campo— y `values` —lo
  escrito, sin archivos ni contraseñas— para volver a llenar el formulario.
- **`field`**: esquemas para lo que llega de un formulario, que siempre es
  texto: `text`, `email`, `number` (acepta coma decimal), `checkbox`,
  `choice` y `optional`. **`fields`** los junta y, a diferencia de un
  esquema de objeto corriente, reúne los errores de todos los campos a la vez.
  `p` sigue siendo para los props de las islas, que llegan como JSON.

`load()` recibe ahora como segundo argumento `{ url, request, cookies }`, y
con servidor puede lanzar `redirect()`: una página sin sesión manda a entrar.

## Seguridad

En `mode: "server"` —y en desarrollo— el kit aplica `ascua-security` sin
configurar nada. Cada página HTML sale con:

- **Content-Security-Policy** sin `'unsafe-inline'` en los scripts: el hash
  de cada script en línea de la página —el del esqueleto, por ejemplo— se
  calcula sobre el HTML que se envía. Lo que se cuele por una plantilla no
  corre. Si el cliente lleva WebAssembly, añade `'wasm-unsafe-eval'`. Con una
  `base` en otro origen, ese origen entra en la política.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`
  y, si la petición llegó por HTTPS —también detrás de un proxy, por
  `X-Forwarded-Proto`—, `Strict-Transport-Security`.

Y para los formularios:

- **Origen comprobado.** Una acción solo corre si `Origin` es el del sitio
  (`X-Forwarded-Host` detrás de un proxy). Un formulario de otro sitio recibe
  un 403. Es la defensa contra CSRF que no necesita tokens en cada formulario.
- **Cookies seguras por defecto.** `cookies.set` las escribe `HttpOnly`,
  `SameSite=Lax`, `Secure` (salvo en `localhost`) y `Path=/`.
  `cookies.setSigned` y `getSigned` las firman con HMAC-SHA256 y la clave de
  la variable de entorno **`ASCUA_SECRET`** (32 caracteres o más); una cookie
  tocada se lee como si no estuviera. En desarrollo, sin `ASCUA_SECRET`, se
  usa una clave aleatoria por proceso.
- **Cuerpo limitado** a 1 MiB: más es un 413.
- Lo que responde a un POST o escribe cookies lleva `Cache-Control: private,
  no-store`.

En desarrollo, la CSP va como `Content-Security-Policy-Report-Only`: avisa en
la consola sin romper nada, para ver antes de desplegar lo que se bloquearía.

```ts
ascua({
  site: {
    mode: "server",
    security: {
      csp: { "img-src": ["https://cdn.ejemplo.cl"], "frame-ancestors": null },
      headers: { "Permissions-Policy": "camera=()" },
      origins: ["https://admin.ejemplo.cl"],
      bodyLimit: 10 * 1024 * 1024,
    },
  },
});
```

`csp` suma fuentes a cada directiva y `null` la quita; `csp: false` no manda
la política; `headers` añade, reemplaza o quita (`null`); `origins` son otros
orígenes de confianza para las acciones. `security: false` lo apaga todo.

Los sitios estáticos no mandan cabeceras —las pone quien los sirve—, así que
esto no les cambia nada.

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
- **Formularios de HTML y no RPC.** Una acción es un `POST` que el
  navegador sabe enviar sin JavaScript; no hay un cliente que generar ni un
  protocolo propio. Mejorarlo con una isla —enviar sin recargar— es trabajo
  aparte, encima de esto.
- **Origen y no tokens contra CSRF.** Todos los navegadores mandan `Origin`
  en un POST, y `SameSite=Lax` ya impide que las cookies viajen en el de otro
  sitio. Un token por formulario añadiría estado sin cubrir nada más.
- **`'unsafe-inline'` en los estilos, no en los scripts.** Los atributos
  `style` no se pueden contar con hashes, y un estilo inyectado no ejecuta
  código. Los scripts sí se cuentan: ahí está el riesgo.
- **El secreto, del entorno.** Nunca dentro del build: `dist/server/` se
  copia y se sube, y un secreto ahí acabaría en cualquier imagen.
- **`paths()` y no rastrear enlaces.** Explícito: lo que se genera es lo
  que la ruta dice, sin adivinar a partir del HTML.
