---
titulo: Rutas
descripcion: La ruta actual es un signal. Enlaces que no recargan, parámetros y vistas que se liberan al salir de ellas, en 0,98 kB.
---

## La ruta es un signal

No hay componente `<Router>` que envuelva la aplicación ni contexto que
propagar. La ruta actual se lee con `ruta()`, y leerla dentro de una closure
hace que ese nodo siga a la URL, igual que con cualquier otro dato:

```ts
import { ruta } from "@ascua/router";

view`<a href="/pedidos" class:activa=${() => ruta().startsWith("/pedidos")}>Pedidos</a>`;
```

```sh
stil add @ascua/router
```

## Vistas por ruta

```ts
import { enlaces, enrutarEn } from "@ascua/router";

enlaces();   // los <a href="/…"> navegan sin recargar

const app = view`
  <div class="app">
    <nav>
      <a href="/">Inicio</a>
      <a href="/pedidos">Pedidos</a>
    </nav>
    <main></main>
  </div>`;

enrutarEn(app.querySelector("main")!, [
  { patron: "/", vista: () => Inicio() },
  { patron: "/pedidos", vista: () => Pedidos() },
  { patron: "/pedidos/:id", vista: ({ id }) => Pedido({ id: id! }) },
  { vista: () => NoEncontrada() },   // sin patrón: el fallback
]);
```

Las rutas se prueban en orden y gana la primera que encaja. Una sin `patron`
encaja siempre, así que va la última.

`enrutarEn` es un [`<Show>`](/docs/control-de-flujo/) por debajo: mientras la
ruta resuelva a lo mismo no se toca el DOM, y al cambiar se libera la vista
anterior entera —efectos, memos, listeners, `onCleanup`— antes de construir la
siguiente. Ir de `/pedidos/1` a `/pedidos/2` sí reconstruye, porque los
parámetros son parte de lo que identifica a la vista.

## Patrones

| Patrón | Encaja con | Parámetros |
|---|---|---|
| `/pedidos` | `/pedidos`, `/pedidos/` | — |
| `/pedidos/:id` | `/pedidos/4821` | `{ id: "4821" }` |
| `/archivos/*` | `/archivos/a/b.txt` | `{ resto: "a/b.txt" }` |

Los parámetros llegan decodificados (`%20` es un espacio). La barra final no
cuenta, y la query tampoco: `/pedidos?orden=fecha` encaja con `/pedidos`.

## Navegar

```ts
import { navegar } from "@ascua/router";

navegar("/pedidos/4821");
navegar("/", { reemplazar: true });   // sin apilar historial
```

`reemplazar` es lo que se quiere tras un login: el botón atrás no debe devolver
al formulario de alguien que ya entró.

`enlaces()` intercepta los clicks en `<a href>` internos del documento —o de
la raíz que se le pase— y devuelve cómo soltarlo. Respeta lo que un enlace
significa: un click con ⌘ o ctrl, uno con el botón central, un `target` o un
`download` siguen abriendo como siempre, y los enlaces a otro origen no se
tocan.

## La query

```ts
import { query } from "@ascua/router";

const orden = memo(() => query().get("orden") ?? "fecha");
```

`query()` devuelve un `URLSearchParams` nuevo con lo que va tras `?`, y es
reactiva como `ruta()`.

## Al desplegar

Las rutas son del cliente, así que el servidor tiene que devolver el
`index.html` para cualquier camino; si no, recargar en `/pedidos` da 404. Cada
hosting lo llama de una forma:

| Dónde | Cómo |
|---|---|
| Netlify | `/* /index.html 200` en `_redirects` |
| Vercel | un `rewrites` a `/index.html` en `vercel.json` |
| nginx | `try_files $uri /index.html;` |
| busybox `httpd` | `E404:/index.html` en `httpd.conf` |

Si la aplicación se sirve con [SSR](/docs/ssr/), el servidor ya resuelve cada
ruta y esto no hace falta.
