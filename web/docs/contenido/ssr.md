---
titulo: SSR e islas
descripcion: Páginas que llegan hechas desde el servidor y solo llevan JavaScript donde hace falta. El cliente adopta los nodos del servidor en vez de rehacerlos.
---

## El mismo código, otro documento

Renderizar en el servidor no necesita un runtime aparte ni un compilador
distinto. `renderToString` ejecuta los mismos componentes sobre un documento en
memoria que trae el propio runtime —sin happy-dom ni jsdom— y lo serializa:

```ts
import { renderToString } from "ascua/servidor";

const html = renderToString(() => Pagina({ usuario }));
```

Los efectos se ejecutan una vez para producir el HTML y todo se libera al
terminar: en el servidor no queda nada vivo.

## Islas

Una página servida es HTML: se ve y se indexa sin JavaScript. Las **islas** son
las regiones que además se activan en el cliente. Lo que no es isla no viaja:
ni su código ni su estado.

```ts
import { island } from "ascua";

function IslaContador(props: { inicial: number }) {
  return island("contador", () => Contador(props), JSON.stringify(props));
}

function Inicio() {
  return view`
    <main>
      <h1>HTML primero</h1>
      <p>Este texto no necesita JavaScript. El contador sí.</p>
      <IslaContador inicial=${3}/>
    </main>`;
}
```

`island(nombre, construir, props)` envuelve el contenido en
`<ascua-island data-ascua-island="contador">` y deja los props en un atributo.
No hay serializador: el formato lo elige quien escribe la isla —aquí JSON— y
el cliente lo interpreta.

## Hidratar

En el cliente, `hydrate` busca las islas del documento y reconstruye cada una
con su constructor:

```ts
import { hydrate } from "ascua";

const { adoptados, creados } = hydrate({
  contador: (props) => Contador(JSON.parse(props)),
});
// { adoptados: 4, creados: 0 }
```

**Adoptar, no reemplazar.** El `<output>` al que queda atado el efecto es el
mismo `<output>` que escribió el servidor: no se crea uno nuevo. No hay
parpadeo y no se pierde lo que el navegador ya tenía —el foco, el scroll, un
`<input>` a medio escribir—.

`creados` debería ser cero. Si no lo es, el servidor y el cliente construyeron
cosas distintas; la página sigue funcionando —lo que no encaja se crea, lo que
sobra se quita—, pero conviene saber por qué.

Las islas sin constructor registrado se dejan intactas, así que el servidor y
el cliente se pueden desplegar por separado sin que la página se rompa.

## Con Vite

El repositorio tiene un ejemplo completo en
[`examples/ssr-ts`](https://github.com/rvielma/ascua/tree/main/examples/ssr-ts): un servidor de Node sin dependencias, Vite como middleware
en desarrollo y `dist/` en producción. Las piezas:

```text
index.html                 plantilla con <!--app--> donde va la página
src/entrada-servidor.ts    render(url) → { html, css, titulo, estado }
src/entrada-cliente.ts     hydrate(ISLAS)
src/paginas.ts             las páginas: solo servidor
src/islas/                 los componentes interactivos
servidor.js                HTTP: Vite en desarrollo, dist/ en producción
```

```ts
// src/entrada-servidor.ts
import { collectStyles, renderToString } from "ascua/servidor";

export function render(url: string) {
  const pagina = paginaPara(new URL(url, "http://x").pathname);
  const html = renderToString(pagina.construir);
  return { html, css: collectStyles(html), estado: pagina.estado };
}
```

```ts
// src/entrada-cliente.ts
import { hydrate } from "ascua";
import { ISLAS } from "./islas/index.js";

hydrate(ISLAS);
```

```sh
vite build --outDir dist/cliente
vite build --ssr src/entrada-servidor.ts --outDir dist/servidor
```

Las páginas no se importan desde el cliente, así que su código no llega al
navegador: el bundle es el runtime y las islas. En el ejemplo, **3,1 kB** gzip
para un contador y un buscador con lista filtrable.

## Estilos

El CSS con scope de un componente llega a Vite como un módulo de estilos, y en
el cliente eso basta. Pero una página que solo se renderiza en el servidor
nunca entra en el bundle del cliente, así que en el servidor el plugin hace
otra cosa: **registra** cada hoja al cargar el módulo, y `collectStyles`
devuelve las que usa una página.

```ts
import { collectStyles, renderToString } from "ascua/servidor";

const html = renderToString(() => Pagina());
const css = collectStyles(html);
// `<style>${css}</style>` en el <head>, `html` en el <body>.
```

`collectStyles` mira qué scopes aparecen en el HTML y devuelve **solo el CSS de
esos componentes**: los estilos llegan con la página, sin parpadeo, sin otra
petición y sin arrastrar los de las páginas que no se están viendo. El código
de las páginas tampoco viaja: en el ejemplo, el CSS del cliente es solo el de
las islas y el global.

## Cómo encuentra cada nodo

El cliente ejecuta el mismo código que el servidor, pero los nodos que
necesita ya existen. Emparejar por posición no funciona: un `<For>` crea su
marcador **antes** que sus items, pero en el HTML queda **después**.

Como el compilador construye en un orden fijo, basta con numerar. Dentro de una
isla, el servidor escribe el número de cada elemento en `data-ascua-h`, y el de
cada marcador dentro del comentario: `<!--5-->`. Al hidratar, el elemento
número *n* del cliente adopta el elemento número *n* del documento y le quita
el atributo. La numeración empieza de cero en cada isla.

Dos detalles:

- **Los textos se sustituyen, no se adoptan.** Un texto dinámico crea su nodo y
  su efecto lo captura antes de saber dónde irá, así que no puede quedarse con
  el del servidor. Se pone en su lugar uno con el mismo contenido: no se nota,
  pero no es el mismo objeto.
- **Dos textos seguidos llevan un separador**, `<!--/-->`, porque el navegador
  los fundiría en uno al leer el HTML. La hidratación lo quita.

Fuera de las islas no se numera nada ni se escriben marcadores: ahí no hay nada
que hidratar.

## En el servidor, sin navegador

El documento de servidor implementa lo que usan el runtime y el código que
emite el compilador, más lo que un componente suele hacer con lo que acaba de
construir: `querySelector` con selectores simples (`div`, `.clase`, `#id`,
`[atributo]`), `classList`, `textContent` y `prop:innerHTML` para HTML de
confianza. Un selector con combinadores da un error que lo dice.

Lo que no existe en el servidor: `window`, `location`, `localStorage`. Un
componente que los necesite los lee dentro de un efecto del cliente, o recibe
el dato por props.

## Lo que falta

- **Navegar entre páginas recarga.** Es una aplicación de varias páginas con
  islas, no una SPA que el servidor pinta la primera vez.
- **No hay streaming**: `renderToString` devuelve la página entera.
