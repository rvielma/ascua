# Ascua

[![npm](https://img.shields.io/npm/v/ascua?logo=npm&label=npm&color=e2703a&labelColor=12100d)](https://www.npmjs.com/package/ascua)
[![runtime](https://img.shields.io/badge/runtime-2%2C25%20kB%20gzip-e2703a?labelColor=12100d)](https://ascua.gitweave.run/docs/como-funciona/#lo-que-cuesta)
[![compilador](https://img.shields.io/badge/compilador-.wasm%20de%2091%20KB-f2b544?logo=webassembly&logoColor=white&labelColor=12100d)](https://ascua.gitweave.run/docs/compilador/)
[![dependencias](https://img.shields.io/badge/dependencias-0-f2b544?labelColor=12100d)](packages/runtime/package.json)
[![Rust](https://img.shields.io/badge/Rust-1.82%2B-6f6860?logo=rust&logoColor=white&labelColor=12100d)](Cargo.toml)
[![licencia](https://img.shields.io/badge/licencia-MIT%20o%20Apache--2.0-6f6860?labelColor=12100d)](#licencia)

Todo lo que hace falta para una aplicación web, sin Virtual DOM: un runtime
reactivo de 3,62 kB, un compilador de plantillas en **WebAssembly**, router,
datos asíncronos, formularios, SSR con islas, tests y los tipos de dentro de
las plantillas, en `tsc` y en el editor.

Escribes **HTML dentro de TypeScript** y el compilador —un `.wasm` de 103 KB— lo
traduce a operaciones directas de DOM. Una aplicación entera pesa 3,77 kB.

**[ascua.gitweave.run](https://ascua.gitweave.run)** ·
**[documentación](https://ascua.gitweave.run/docs/)** · el compilador corre en tu
pestaña: **[playground](https://ascua.gitweave.run/playground/)**

## Empezar

Basta con Node y [stil](https://stil.gitweave.run) —o npm—. **No hace falta
Rust**: el compilador llega como `.wasm` dentro del paquete, y el mismo archivo
vale para macOS, Linux y Windows.

```sh
stil add ascua
stil add -D vite
stil add -D vite-plugin-ascua
```

```ts
// vite.config.ts
import ascua from "vite-plugin-ascua";

export default { plugins: [ascua({ site: true })] };
```

```ts
// src/routes/index.ts
export const title = "Inicio";

export default function Inicio() {
  return view`<main><h1>Hola</h1></main>`;
}
```

Con `"dev": "vite"` y `"build": "vite build"` en el `package.json`:

```sh
stil run dev      # cada página renderizada al vuelo, con recarga
stil run build    # dist/: una página HTML por archivo de src/routes/, lista para subir
```

Cada archivo de `src/routes/` es una página; lo interactivo va en islas y es lo
único que lleva JavaScript. Con `ascua({ site: { mode: "server" } })`, el
build deja además un servidor Node con todo dentro. Sin `site`, el plugin
solo compila las plantillas, para una aplicación de una página.
[Guía de sitios](https://ascua.gitweave.run/docs/sitios/).

```ts
export function Contador() {
  const count = signal(0);

  return view`
    <button class="contador" onclick=${() => count.update((c) => c + 1)}>
      Clicks: ${() => count()}
      <style>
        .contador { border-radius: 8px; padding: .5rem 1rem; }
      </style>
    </button>`;
}
```

Una closure es reactiva; cualquier otra expresión se evalúa una vez. El
`<style>` se extrae al compilar y no deja nada en tiempo de ejecución.

Para lo que no cabe en un botón están los componentes y el control de flujo,
con la convención de siempre —minúscula es HTML, mayúscula es componente:

```ts
view`
  <main>
    <Show when=${() => sesion() !== null}>
      <Panel sesion=${() => sesion()!}/>
      <Else><Login onentrar=${(s) => sesion.set(s)}/></Else>
    </Show>

    <ul>
      <For each=${() => tareas()} key=${(t) => t.id}
           render=${(t) => view`<li>${t.titulo}</li>`}/>
    </ul>
  </main>`;
```

Las rutas son signals, con [`ascua-router`](packages/router):

```ts
links();   // los <a href="/…"> navegan sin recargar

mountRoutes(app.querySelector("main")!, [
  { pattern: "/pedidos", view: Pedidos },
  { pattern: "/pedidos/:id", view: ({ id }) => Pedido({ id }) },
  { view: NoEncontrado },
]);
```

Los datos que llegan tarde y los formularios tampoco se escriben a mano:

```ts
const club = resource(
  () => id(),
  (id, { signal }) => fetch(`/api/clubes/${id}`, { signal }).then((r) => r.json()),
);
const nombre = signal("");

view`
  <section>
    <Show when=${() => club()}>${(c) => view`<h2>${() => c().nombre}</h2>`}</Show>
    <input bind:value=${nombre}>
  </section>`;
```

`resource` cancela la carga anterior al cambiar `id` y al cerrar la vista;
dentro del `<Show>`, `c()` ya es un `Club`, sin `?.`.

Y los tests, con [`ascua-testing`](packages/testing):

```ts
const { get, text } = render(() => Acceso({ onentrar }));
input(get<HTMLInputElement>("input[name=usuario]"), "ana");
click(get("button"));
expect(text(".error")).toBe("Falta la contraseña.");
```

Hay un panel con acceso, rutas, tabla filtrable y componentes con props en
[`examples/panel-ts`](examples/panel-ts): **5,7 kB** de JavaScript y 1,4 kB de
CSS, gzip, la aplicación entera.

## Qué trae

| Paquete | Para qué | Peso |
|---|---|---|
| [`ascua`](packages/runtime) | Signals, DOM, `resource`, `bind:`, SSR e islas. Cero dependencias | 3,62 kB gzip |
| [`ascua-compilador`](packages/compilador) | Plantillas a operaciones de DOM, como `.wasm` para Node, Bun, Deno y el navegador | 103 KB, en build |
| [`vite-plugin-ascua`](packages/vite-plugin) | Compila las plantillas en Vite; con `site: true`, una página HTML por archivo de `src/routes/` | en build |
| [`ascua-router`](packages/router) | La ruta como signal: parámetros, query, enlaces | 1,03 kB gzip |
| [`ascua-testing`](packages/testing) | Montar, `click`, `input`, `drag`, `waitFor` y desmontar en un test | en tests |
| [`ascua-check`](packages/check) | Los tipos de dentro de las plantillas, con el `tsc` del proyecto | en CI |
| [`ascua-ts-plugin`](packages/ts-plugin) | Lo mismo en el editor: errores, autocompletado, ir a la definición | en el editor |

Y lo que resuelven juntos:

| | |
|---|---|
| Componentes | Funciones con props e hijos; `<Menu/>` sin firma de props |
| Control de flujo | `<Show>` con `<Else>` y con el valor ya estrechado; `<For>` con clave |
| Formularios | `bind:value`, `bind:checked`, `bind:valueAsNumber`; `prop:` para lo demás |
| Datos asíncronos | `resource`: estado, error, recarga y cancelación |
| Estilos | `<style>` con scope, extraído al compilar: nada en tiempo de ejecución |
| SVG y MathML | En su espacio de nombres, también al hidratar |
| SSR | `renderToString`, islas e hidratación que adopta los nodos del servidor |
| Sitios | `stil run build` deja un HTML por ruta, con datos de `load()`; solo las páginas con islas llevan JavaScript. O un servidor Node con `mode: "server"` |
| Islas con props validados | `defineIsland`: el esquema se comprueba al compilar y al hidratar |
| Errores | `onError` por vista; los del compilador, con archivo y línea |
| Source maps | El error señala tu `.ts`, no el código generado |

**397 tests** (168 en Rust, 229 en TypeScript), sin warnings de `clippy`, todo
verificado en navegador real.

| | gzip |
|---|---|
| Una aplicación entera (runtime + contador + lista con clave) | **3,77 kB** |
| Un panel con acceso, rutas, tabla filtrable y componentes | 7,24 kB + 1,43 kB de CSS |
| Solo el runtime | 3,62 kB |
| El runtime con `hydrate` e `island` | 4,59 kB |
| La validación de props de `defineIsland` | +0,75 kB |
| El router | 1,03 kB |
| React + ReactDOM, sin aplicación | ~45 kB |

En velocidad, las operaciones de js-framework-benchmark dan a Ascua **1,10×** el
tiempo del DOM escrito a mano: empatada con Solid (1,07× y 1,13× en las dos
pasadas, contra 1,10× y 1,10× de Ascua), por delante de Svelte (1,13×) y muy
por delante de React (1,85×). Método y datos crudos en [`benchmarks/`](benchmarks) y en
[la documentación](https://ascua.gitweave.run/docs/rendimiento/).

## Cómo está construido

```
packages/
  runtime/          ascua — signals y operaciones de DOM (TypeScript)
  compilador/       ascua-compilador — el compilador como .wasm
  vite-plugin/      vite-plugin-ascua
  router/           ascua-router — la ruta como signal
  testing/          ascua-testing — montar y tocar componentes en un test
  check/            ascua-check — ascua-check, los tipos de dentro de las plantillas
  ts-plugin/        ascua-ts-plugin — las plantillas entendidas por el editor
crates/
  ascua-compilador/ El compilador: escáner, parser de plantillas y codegen
  ascua-css/        Scoping de CSS, compartido por los dos compiladores
  ascua-reactive/   El grafo reactivo en Rust puro, cero dependencias
  ascua-dom/        Runtime DOM en Rust: SSR, islas e hidratación
  ascua-macro/      La macro view! y #[component] de la vía Rust
  ascua-router/     La ruta como signal
playground/         El compilador corriendo en el navegador
examples/
  contador-ts/      Una aplicación en la vía TypeScript
  panel-ts/         Un panel con acceso: componentes, regiones y lista con clave
  ssr-ts/           Páginas en el servidor con islas que se hidratan (Vite SSR)
  sitio-ts/         Un sitio estático: una página por archivo de src/routes/
  demo/             SSR + islas + router + hidratación (vía Rust)
  sitio-wasm/       El sitio anterior, en la vía Rust
docs/               reactividad · plantillas-ts · templates · meta-framework
```

### Dos vías

Ascua empezó como un framework en Rust compilado a WebAssembly. Ese trabajo
sigue aquí y funciona. El SSR con hidratación nació en ella y la vía nueva lo
hereda con el mismo diseño: numerar lo que se construye y adoptarlo en el
cliente.

La vía que se recomienda hoy es la de **TypeScript**: el desarrollador escribe
HTML y TypeScript, y el WebAssembly se queda donde de verdad aporta —el
compilador— en lugar de cobrarle 46 kB al visitante. El motivo, con números,
está en el sitio.

## Las tres ideas

### 1. Sin Virtual DOM

La relación entre un dato y el nodo que lo muestra se establece una sola vez, al
compilar la plantilla. Cambiar el dato ejecuta la operación que le corresponde,
porque el efecto ya tiene capturado el nodo. Comprobable: tras varios clicks, el
nodo de texto **sigue siendo el mismo objeto del DOM**.

### 2. Una closure es reactiva; todo lo demás, no

```ts
${count()}          // valor fijo, nunca cambia
${() => count()}    // este nodo sigue al signal
```

La distinción es sintáctica, no de tipos: mirando la plantilla se sabe qué puede
cambiar. Ver [`docs/plantillas-ts.md`](docs/plantillas-ts.md).

### 3. WebAssembly donde suma

El compilador es un `.wasm` de 103 KB: un solo artefacto para Node, Bun, Deno y
el navegador. Sin binarios por plataforma —SWC publica una decena, esbuild
veinte— y sin `postinstall` que descargue nada. Va igual de rápido que un
binario nativo porque se ahorra un proceso por archivo, y el mismo artefacto da
un playground que compila en tu pestaña.

En el navegador, en cambio, no aporta: el DOM vive en JavaScript y cruzar la
frontera cuesta más que la operación. Por eso el runtime son 3,62 kB de
JavaScript.

## Desarrollo

Esto es para trabajar **en** Ascua, no para usarla. Aquí sí hace falta Rust
(1.82 o posterior), porque el compilador está escrito en Rust.

Todo lo que hay que comprobar antes de registrar un cambio, en un comando:

```sh
bash scripts/verificar.sh            # Rust, MSRV, WASM, TypeScript, ascua-check y los ejemplos
bash scripts/verificar.sh --rapido   # sin MSRV ni el build de los ejemplos
```

Los comandos de Node usan [**stil**](https://stil.gitweave.run), el gestor de
paquetes con el que se desarrolla Ascua: aísla los scripts de instalación,
bloquea las versiones publicadas hace menos de siete días y consulta los avisos
de seguridad de npm en cada install. Se instala con

```sh
curl -fsSL https://stil.gitweave.run/install.sh | bash
```

No es obligatorio: `stil run test` es `npm run test`, y
`scripts/instalar-dependencias.sh` usa npm si no encuentra stil.

Las dependencias de cada directorio se instalan con
`bash scripts/instalar-dependencias.sh <dir>…`, que enlaza los paquetes
de Ascua desde `packages/`. Por partes:

```sh
cargo test                   # 168 tests del compilador y la vía Rust
cargo clippy --all-targets   # sin warnings

cd packages/runtime && stil run test    # 125 tests del runtime
cd packages/router && stil run test     # 20 tests del router
cd packages/testing && stil run test    # 17 tests del paquete de testing
cd packages/check && stil run test      # 8 tests de ascua-check
cd packages/ts-plugin && stil run test  # 17 tests del plugin del editor, con tsserver
cd packages/vite-plugin && stil run test # 27 tests del plugin de Vite: sitio estático, desarrollo, servidor e hidratación
cd examples/panel-ts && stil run check  # ascua-check sobre el panel
cd examples/panel-ts && stil run test   # 7 tests de la aplicación de ejemplo
cd examples/ssr-ts && stil run test     # 8 tests del ejemplo con SSR
cd examples/panel-ts && stil run dev
```

`verificar.sh` recompila el `.wasm` del compilador antes de probar nada, así
que un cambio en el compilador llega solo al plugin de Vite y a los ejemplos.

## Lo que queda fuera, a propósito

- **Vistas con varias raíces.** Un nodo raíz por vista es lo que permite que
  montar, desmontar e hidratar sean operaciones sobre *un* nodo. Donde los
  fragmentos hacen falta —el contenido que recibe un componente— sí están.
- **Insertar nodos con `${expr}`.** Un hueco siempre es texto; para componer
  árboles, un componente. Distinguirlo por tipo exigiría adivinar la intención.
- **Server Components y compatibilidad con JSX o con la API de hooks.** Eran
  no-objetivos desde el principio.

## Licencia

MIT OR Apache-2.0
