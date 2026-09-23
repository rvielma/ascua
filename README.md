# Ascua

Framework de UI sin Virtual DOM. Escribes **HTML dentro de TypeScript** y el
compilador —un módulo **WebAssembly** de 81 KB— lo traduce a operaciones
directas de DOM. Una aplicación entera pesa 2,18 kB.

**[ascua.gitweave.run](https://ascua.gitweave.run)** · el compilador corre en tu
pestaña: **[playground](https://ascua.gitweave.run/playground/)**

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

Las rutas son signals, con [`@ascua/router`](packages/router):

```ts
enlaces();   // los <a href="/…"> navegan sin recargar

enrutarEn(app.querySelector("main")!, [
  { patron: "/pedidos", vista: Pedidos },
  { patron: "/pedidos/:id", vista: ({ id }) => Pedido({ id }) },
  { vista: NoEncontrado },
]);
```

Hay un panel con acceso, rutas, tabla filtrable y componentes con props en
[`examples/panel-ts`](examples/panel-ts): **5,6 kB** de JavaScript y 1,4 kB de
CSS, gzip, la aplicación entera.

## Estado

| Pieza | Qué es | Estado |
|---|---|---|
| `@ascua/runtime` | Signals y DOM, 1,77 kB gzip, cero dependencias | ✅ |
| `ascua-compilador` | Plantillas a operaciones de DOM. Se distribuye como WASM | ✅ |
| `@ascua/vite-plugin` | Integración con Vite | ✅ |
| `@ascua/router` | La ruta como signal, 0,98 kB gzip | ✅ |
| `@ascua/testing` | Montar, tocar y desmontar en un test | ✅ |
| CSS scoped en build time | `<style>` sin runtime de estilos | ✅ |
| Componentes con props e hijos | `<Panel titulo=${t}>…</Panel>` | ✅ |
| Control de flujo | `<Show>`, `<Else>`, `<For>` con clave | ✅ |
| Propiedades del DOM | `prop:value`, para formularios que mandan | ✅ |
| Source maps | El error señala tu `.ts`, no el código generado | ✅ |
| Resaltado en el editor | `html` como alias de `view`, para lit-html y compañía | ✅ |
| Publicado en npm | Los paquetes están listos; falta `npm publish` | ⬜ |
| SSR e hidratación | Hecho en la vía Rust; pendiente de portar | ⬜ |

**217 tests** (142 en Rust, 75 en TypeScript), sin warnings de `clippy`, todo
verificado en navegador real.

| | gzip |
|---|---|
| Una aplicación entera (runtime + contador + lista con clave) | **2,18 kB** |
| Un panel con acceso, tabla filtrable y componentes | 4,72 kB + 1,39 kB de CSS |
| Solo el runtime | 1,77 kB |
| El router | 0,98 kB |
| React + ReactDOM, sin aplicación | ~45 kB |

## Cómo está construido

```
packages/
  runtime/          @ascua/runtime — signals y operaciones de DOM (TypeScript)
  compilador/       @ascua/compilador — el compilador como .wasm
  vite-plugin/      @ascua/vite-plugin
  router/           @ascua/router — la ruta como signal
  testing/          @ascua/testing — montar y tocar componentes en un test
crates/
  ascua-compilador/ El compilador: escáner, parser de plantillas y codegen
  ascua-css/        Scoping de CSS, compartido por los dos compiladores
  ascua-reactive/   El grafo reactivo en Rust puro, cero dependencias
  ascua-dom/        Runtime DOM en Rust: SSR, islas e hidratación
  ascua-macro/      La macro view! y #[component] de la vía Rust
  ascua-router/     La ruta como signal
web/                El sitio, con los demos como islas
playground/         El compilador corriendo en el navegador
examples/
  contador-ts/      Una aplicación en la vía TypeScript
  panel-ts/         Un panel con acceso: componentes, regiones y lista con clave
  demo/             SSR + islas + router + hidratación (vía Rust)
  sitio-wasm/       El sitio anterior, en la vía Rust
docs/               reactividad · plantillas-ts · templates · meta-framework
```

### Dos vías

Ascua empezó como un framework en Rust compilado a WebAssembly. Ese trabajo
sigue aquí, funciona y tiene cosas que la vía nueva todavía no: SSR con
hidratación que adopta los nodos del servidor sin recrear ninguno.

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

El compilador es un `.wasm` de 81 KB: un solo artefacto para Node, Bun, Deno y
el navegador. Sin binarios por plataforma —SWC publica una decena, esbuild
veinte— y sin `postinstall` que descargue nada. Va igual de rápido que un
binario nativo porque se ahorra un proceso por archivo, y el mismo artefacto da
un playground que compila en tu pestaña.

En el navegador, en cambio, no aporta: el DOM vive en JavaScript y cruzar la
frontera cuesta más que la operación. Por eso el runtime son 1,77 kB de
JavaScript.

## Desarrollo

```sh
cargo test                   # 142 tests del compilador y la vía Rust
cargo clippy --all-targets   # sin warnings

cd packages/runtime && stil run test    # 41 tests del runtime
cd packages/router && stil run test     # 18 tests del router
cd packages/testing && stil run test    # 9 tests del paquete de testing
cd examples/panel-ts && stil run test   # 7 tests de la aplicación de ejemplo
cd web && ./build.sh                    # el sitio, con el playground dentro
cd examples/panel-ts && stil run dev
```

El compilador como WebAssembly —**hay que rehacerlo cada vez que cambia el
compilador**, o el plugin de Vite seguirá usando el artefacto de antes:

```sh
./scripts/compilar-wasm.sh   # pkg/ para Node, web/ para el navegador
```

Publicar los paquetes (pide `npm login`; `stil` no cubre `publish`):

```sh
./scripts/publicar-npm.sh --dry-run   # enseña qué subiría cada paquete
./scripts/publicar-npm.sh
```

> **macOS**: esta plataforma tiene dos manías que no vienen del código y que
> `.cargo/config.toml` ya sortea con
> [`scripts/cargo-runner-macos.sh`](scripts/cargo-runner-macos.sh): invalida la
> firma ad-hoc de los binarios que cargo copia a `target/` (el kernel los mata
> con `signal: 9, SIGKILL` sin ninguna salida) y SIP borra las variables
> `DYLD_*` al pasar por un intérprete protegido, lo que deja a los tests de
> proc-macro sin encontrar `libstd`.
>
> Los build scripts no pasan por ese runner. Si uno muere con SIGKILL, usar
> [`./scripts/cargo.sh`](scripts/cargo.sh) en lugar de `cargo`.

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
