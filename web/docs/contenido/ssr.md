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
import { defineIsland, p } from "ascua";

export const IslaContador = defineIsland("contador", { inicial: p.number }, Contador);

function Inicio() {
  return view`
    <main>
      <h1>HTML primero</h1>
      <p>Este texto no necesita JavaScript. El contador sí.</p>
      <IslaContador inicial=${3}/>
    </main>`;
}
```

Una isla se define una vez: su nombre, el **esquema** de sus props y el
componente. En el servidor se usa como cualquier componente, y sale envuelta en
`<ascua-island data-ascua-island="contador">` con los props en JSON.

## Hidratar

En el cliente, `hydrate` recibe las islas, busca las suyas en el documento y
activa cada una:

```ts
import { hydrate } from "ascua";

const { adoptados, creados } = hydrate([IslaContador]);
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

## Props que no mienten

Los props viajan del servidor al cliente como texto, y ahí el tipo que declara
TypeScript deja de valer: `JSON.parse` devuelve `any`. Un servidor de otra
versión puede haber renombrado un prop; un número puede haber llegado como
`"5"` desde un query string, y el contador mostraría `51` al sumar. Nada de eso
da error: da un dato equivocado.

El esquema cierra esa brecha dos veces:

- **Al compilar.** Si el esquema no encaja con los props del componente —dice
  `p.string` donde el componente espera `number`, o le falta un prop—, es un
  error de tipos. También lo es pasarle a la isla un prop que el esquema no
  admite. `ascua-check` lo señala en la plantilla.
- **Al hidratar.** Antes de tocar el DOM se comprueba lo que llegó. Si no
  encaja, la isla **se queda estática**, tal como la pintó el servidor, y la
  consola dice qué campo falló:

```text
[ascua] isla "buscador": lenguajes[1].año: se esperaba number, llegó string "1958". Se deja estática.
```

El tipo de los props sale del esquema, no al revés: no hay dos descripciones
que puedan contradecirse.

| Esquema | Acepta |
| --- | --- |
| `p.string`, `p.number`, `p.boolean` | ese tipo |
| `p.array(e)` | un array cuyos elementos encajan con `e` |
| `p.object({ … })` | un objeto con esos campos; lo que sobra se descarta |
| `p.optional(e)` | `e`, o que falte |
| `p.nullable(e)` | `e`, o `null` |

`{ inicial: p.number }` es un atajo de `p.object({ inicial: p.number })`.

Los esquemas de `p` siguen [Standard Schema](https://standardschema.dev), y
`defineIsland` acepta cualquiera que lo siga: uno de Zod, Valibot o ArkType
sirve igual, también dentro de `p.object`, con sus transformaciones —un texto
que llega y se convierte en `Date`—. Solo los síncronos: la hidratación no
puede esperar.

Validar cuesta unos **0,75 kB** gzip, y solo lo paga quien importa
`defineIsland`.

### Sin esquema

`island` es la pieza de debajo, para quien quiera otro formato que JSON o no
quiera validar:

```ts
import { island } from "ascua";

function IslaContador(props: { inicial: number }) {
  return island("contador", () => Contador(props), JSON.stringify(props));
}

hydrate({ contador: (props) => Contador(JSON.parse(props)) });
```

`island(nombre, construir, props)` envuelve el contenido y deja `props` en un
atributo, sin interpretarlo. `hydrate` acepta entonces un objeto que va del
nombre a una función de ese texto. Aquí nada comprueba que los dos lados
coincidan.

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
navegador: el bundle es el runtime y las islas. En el ejemplo, **4,0 kB** gzip
para un contador y un buscador con lista filtrable, con la validación de props
incluida.

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
