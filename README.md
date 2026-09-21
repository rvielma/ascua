# Ascua

Framework de UI para la web escrito desde cero en Rust y compilado a
WebAssembly. Sin React, sin Vue, sin Svelte, sin Virtual DOM y sin runtime de
reactividad de terceros: el mecanismo completo se construye aquí para que pueda
entenderse y repararse sin depender de nadie.

Esto es lo que sirve el servidor del demo, sin que el navegador haya ejecutado
todavía una sola línea de JavaScript:

```html
<ascua-island data-ascua-island="app">
  <div class="app"><nav class="nav">…</nav>
    <section class="panel"><h2>Tareas</h2>
      <p class="resumen">2 tareas pendientes</p>
      <ul class="lista"><li class="pendiente">…</li><li class="pendiente">…</li></ul>
```

Cuando el WASM arranca, **adopta** esos nodos en vez de rehacerlos: 37 adoptados,
0 creados.

```rust
#[component]
fn Contador<B: Backend>(dom: &Dom<B>, count: Signal<i32>) -> B::Node {
    view! { dom,
        <button on:click={move |_| count.update(|c| *c += 1)}>
            "Clicks: " {move || count.get()}
            <style>r#"
                button { border-radius: 8px; }
            "#</style>
        </button>
    }
}
```

## Estado

| Fase | Entregable | Estado |
|---|---|---|
| 1 | `ascua-reactive` — signals, effects, memos | ✅ |
| 2 | `ascua-dom` — runtime DOM con backends intercambiables | ✅ |
| 3 | `ascua-macro` — `view!` y `#[component]` | ✅ |
| 4 | Componentes con hijos, `<Show>`, `<For>` | ✅ |
| 5 | CSS scoped extraído en build time | ✅ |
| 6 | `ascua-router` — la ruta como signal | ✅ |
| 7 | SSR e islas | ✅ |
| 8 | Hidratación real: el cliente adopta los nodos del servidor | ✅ |
| 9 | Props opcionales y control de flujo dentro de componentes | ✅ |

**84 tests**, sin warnings de `clippy`, todo verificado en navegador real. El
demo son 160 KB de WASM y 11 KB de glue JS, sin una línea de ningún framework
de UI de terceros. Su hidratación, medida en el navegador: **37 nodos
adoptados, 0 creados**.

## Cómo está construido

```
crates/
  ascua-reactive/   El grafo reactivo. Rust puro, cero dependencias, sin DOM.
  ascua-dom/        Operaciones de nodo, bindings, SSR, islas e hidratación.
  ascua-macro/      Las macros view! y #[component], y el scoping de CSS.
  ascua-router/     La ruta actual como signal.
  ascua/            Fachada: lo único que una aplicación declara.
examples/
  demo/             SSR + islas + router, con los componentes compartidos
                    entre servidor y cliente (src/app.rs).
site/               El sitio del proyecto, construido con Ascua: el contenido
                    se renderiza en servidor y los demos son islas.
docs/
  reactividad.md    El mecanismo reactivo completo, explicado.
  templates.md      La macro view!, sus reglas y el CSS scoped.
  meta-framework.md Router, SSR, islas e hidratación.
```

Las capas son independientes: el núcleo reactivo no sabe que existe el DOM, el
runtime DOM no sabe que existe la macro, y el router solo necesita signals.

## Las cuatro ideas

### 1. Sin Virtual DOM

La relación entre un dato y el nodo que lo muestra se establece una sola vez, al
compilar el template. Cambiar el dato ejecuta directamente la operación de DOM
que le corresponde, porque el efecto ya tiene capturado el nodo.

Esto es comprobable, y el demo lo comprueba: tras varios clicks, el nodo de
texto **sigue siendo el mismo objeto del DOM** que al montar. Ver
[`docs/reactividad.md`](docs/reactividad.md).

### 2. Una closure es reactiva; todo lo demás, no

```rust
{count.get()}          // valor fijo, nunca cambia
{move || count.get()}  // este nodo sigue al signal
```

La distinción es sintáctica, no de tipos: mirando el template se sabe qué puede
cambiar, sin conocer los tipos ni confiar en ninguna regla implícita. Ver
[`docs/templates.md`](docs/templates.md).

### 3. Un componente es una función

`#[component]` solo genera el struct de props y su builder, porque Rust no
tiene argumentos con nombre. El componente se puede llamar a mano y no hay
registro de componentes ni despacho dinámico.

Los props con `#[prop(default)]` se pueden omitir, y olvidar uno obligatorio es
un **error de compilación** con un mensaje que lo dice:

```text
error: faltan props obligatorios: este componente necesita texto
```

### 4. Un backend, cuatro destinos

El runtime habla con el trait `Backend`, no con `web-sys`. De ahí salen cuatro
cosas sin escribir el código cuatro veces: la interfaz en el navegador, el HTML
en el servidor, la hidratación (un backend que envuelve a otro y adopta lo que
encuentra) y una suite de **84 tests que corre sin navegador**. Ver
[`docs/meta-framework.md`](docs/meta-framework.md).

## Decisiones de arquitectura

- **Reactividad fine-grained con signals**, sin VDOM ni diffing global. El único
  sitio con reconciliación es la lista con clave, y compara una lista de claves,
  no un árbol.
- **Sintaxis vía macro de Rust** (`view! { }`), no archivo `.ascua`: funciona con
  `rust-analyzer`, `cargo build` y el borrow checker desde el primer día.
- **CSS scoped en build time**: el `<style>` no deja nada en runtime, solo un
  atributo en los elementos y un archivo CSS que recoge el build.
- **El router es un signal**: sin componente `<Router>`, sin contexto, sin
  re-render al navegar.
- **SSR, islas e hidratación**: el servidor renderiza HTML con los mismos
  componentes y numera los elementos de cada isla; el cliente construye en el
  mismo orden y **adopta** esos nodos en vez de rehacerlos. Si algo no encaja,
  ese nodo se crea y la aplicación sigue.
- **Cero dependencias en el núcleo reactivo.** Literalmente cero.

### Las únicas dependencias externas, y por qué

| Crate | Dónde | Por qué |
|---|---|---|
| `wasm-bindgen`, `web-sys` | `ascua-dom`, `ascua-router`, feature `web` | Son los bindings a las APIs del navegador, no un framework. Solo en los backends web, que son sustituibles. |
| `syn`, `quote`, `proc-macro2` | `ascua-macro` | Parsear tokens de Rust en un proc-macro. Son infraestructura del compilador, no de UI, y no aparecen en el bundle final. |

Ninguna entra en el núcleo reactivo ni en el runtime DOM genérico.

## Desarrollo

```sh
cargo test                                   # 84 tests, sin navegador
cargo clippy --all-targets                   # sin warnings
cargo fmt --all
cargo build --target wasm32-unknown-unknown  # el núcleo compila a WASM
```

El sitio (construido con el propio framework):

```sh
cd site
./build.sh && stil run dev    # http://localhost:5178
```

El demo completo (servidor + cliente):

```sh
cd examples/demo
./build.sh                      # necesita wasm-bindgen-cli
python3 -m http.server 8080     # abrir http://localhost:8080
```

`build.sh` compila el WASM del cliente, genera el HTML de cada ruta con los
mismos componentes y le incrusta el CSS que la macro extrajo al compilar.

> **macOS**: esta plataforma tiene dos manías que no vienen del código y que
> `.cargo/config.toml` ya sortea con
> [`scripts/cargo-runner-macos.sh`](scripts/cargo-runner-macos.sh): invalida la
> firma ad-hoc de los binarios que cargo copia a `target/` (el kernel los mata
> con `signal: 9, SIGKILL` sin ninguna salida) y SIP borra las variables
> `DYLD_*` al pasar por un intérprete protegido, lo que deja a los tests de
> proc-macro sin encontrar `libstd`.
>
> Los build scripts no pasan por ese runner. Si uno muere con SIGKILL, usar
> [`./scripts/cargo.sh`](scripts/cargo.sh) en lugar de `cargo`: detecta ese
> fallo concreto, re-firma y reintenta.

## Lo que queda fuera, a propósito

- **Vistas con varias raíces.** Un nodo raíz por vista es lo que permite que
  montar, desmontar e hidratar sean operaciones sobre *un* nodo. Donde los
  fragmentos hacen falta —el contenido que recibe un componente— sí están.
- **Insertar nodos con `{expr}`.** Un bloque siempre es texto; para componer
  árboles, un componente. Distinguirlo por tipo exigiría adivinar la intención.
- **Server Components y compatibilidad con JSX o con la API de hooks.** Eran
  no-objetivos desde el principio.

## Licencia

MIT OR Apache-2.0
