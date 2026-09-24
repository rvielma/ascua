# ascua-router

El router de [Ascua](https://ascua.gitweave.run) en **0,98 kB** gzip. La ruta es
un signal: leerla dentro de una closure hace que ese nodo siga a la URL, igual
que con cualquier otro dato.

```sh
stil add ascua-router      # o npm install ascua-router
```

```ts
import { enlaces, enrutarEn, navegar, ruta } from "ascua-router";

enlaces();   // los <a href="/…"> navegan sin recargar

const app = view`
  <div class="app">
    <nav>
      <a href="/" class=${() => (ruta() === "/" ? "activa" : "")}>Inicio</a>
      <a href="/pedidos">Pedidos</a>
    </nav>
    <main></main>
  </div>`;

enrutarEn(app.querySelector("main")!, [
  { patron: "/", vista: () => Inicio() },
  { patron: "/pedidos", vista: () => Pedidos() },
  { patron: "/pedidos/:id", vista: ({ id }) => Pedido({ id }) },
  { vista: () => NoEncontrado() },          // sin patrón: el fallback
]);
```

`enrutarEn` es el `show` del runtime por debajo: mientras la ruta resuelva a lo
mismo no se toca el DOM, y al cambiar se libera la vista anterior entera
—efectos, memos, listeners, `onCleanup`— antes de construir la siguiente.
Devuelve cómo soltarla.

## Lo que hay

| | |
|---|---|
| `ruta()` | La ruta actual con su query. Reactiva. |
| `navegar(destino, { reemplazar })` | Cambia de ruta. `reemplazar` no apila historial — lo que quieres tras un login. |
| `enlaces(raiz?)` | Intercepta los clicks en enlaces internos. Devuelve cómo soltarlo. |
| `coincide(patron, contra?)` | Los parámetros que captura, o `null`. |
| `query()` | Un `URLSearchParams` con lo que va tras `?`. |
| `sinQuery(valor)` | El camino a secas. |
| `enrutarEn(padre, rutas)` | Monta la vista de la ruta actual. |

Los patrones admiten `:nombre` para capturar un segmento y `*` para quedarse
con el resto. `/pedidos` y `/pedidos/` son la misma ruta; `/pedidos` y
`/pedidos/4821` no.

`enlaces()` respeta lo que un enlace significa: un click con ⌘ o ctrl, uno con
el botón central, un `target` o un `download` siguen abriendo como siempre, y
los enlaces externos no se tocan.

## Al desplegar

Las rutas son del cliente, así que el servidor tiene que devolver el
`index.html` para cualquier camino — si no, recargar en `/pedidos` da 404.
Cada hosting lo llama de una forma; con el `httpd` de busybox, que es lo que
usa Hull con `serve: static`, basta un `httpd.conf` junto al sitio:

```
E404:/index.html
```

## Licencia

MIT OR Apache-2.0
