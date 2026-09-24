---
titulo: Qué es Ascua
descripcion: Un framework de UI sin Virtual DOM. Escribes HTML dentro de TypeScript, un compilador en WebAssembly lo traduce a operaciones de DOM, y al navegador llegan 2,23 kB de runtime.
---

## La idea en una pantalla

```ts
import { signal } from "ascua";

function Contador() {
  const cuenta = signal(0);

  return view`
    <button onclick=${() => cuenta.update((c) => c + 1)}>
      Clicks: ${() => cuenta()}
    </button>`;
}
```

Eso es HTML de verdad —`onclick`, no `onClick`— dentro de una plantilla de
TypeScript. `view` no existe en tiempo de ejecución: el compilador la sustituye
por las llamadas que construyen ese botón, y pone **un efecto en el único punto
que lee un signal**, el texto. Cuando `cuenta` cambia, ese efecto escribe en ese
nodo de texto. No se vuelve a ejecutar la función, no se construye un árbol
nuevo y no se compara con el anterior.

## Por qué sin Virtual DOM

Un framework con Virtual DOM responde a un cambio reconstruyendo una
representación del árbol y comparándola con la anterior para deducir qué tocar.
El trabajo es proporcional al tamaño del árbol, no al del cambio.

Ascua establece **una sola vez**, al compilar, la relación entre cada dato y el
nodo que lo muestra. A partir de ahí, cambiar el dato ejecuta directamente la
operación de DOM que le corresponde. No hay nada que deducir porque nada se
olvidó. Es el mismo modelo que Solid o Svelte 5; lo que cambia es dónde vive
cada pieza.

## Las tres ideas

**1. Una closure es reactiva; todo lo demás, no.** `${() => cuenta()}` sigue al
signal; `${cuenta()}` se evalúa una vez. Se sabe qué puede cambiar mirando la
plantilla, sin conocer los tipos. Está en [Plantillas](/docs/plantillas/).

**2. HTML, no JSX.** Los atributos son los del HTML, el marcado se copia y se
pega tal cual, y un `<style>` dentro de la plantilla es CSS con scope que se
extrae al compilar. Está en [Estilos](/docs/estilos/).

**3. WebAssembly donde suma.** El compilador está escrito en Rust y se
distribuye como un único `.wasm` de 87 KB que corre en Node, Bun, Deno y el
navegador —el [playground](/playground/) es ese mismo archivo—. En el
navegador, en cambio, el DOM vive en JavaScript y cruzar la frontera cuesta más
que la operación, así que el runtime es JavaScript. Está en
[Cómo funciona](/docs/como-funciona/).

## Lo que trae

| Paquete | Qué es | gzip |
|---|---|---|
| `ascua` | Signals, operaciones de DOM, SSR e hidratación | 2,23 kB |
| `ascua-router` | La ruta como signal, con parámetros y enlaces que no recargan | 0,98 kB |
| `ascua-testing` | Montar, tocar y desmontar un componente en un test | — |
| `vite-plugin-ascua` | Compila las plantillas y entrega el CSS a Vite | — |
| `ascua-compilador` | El compilador, como módulo WebAssembly | — |

Una aplicación entera —runtime, un contador y una lista con clave— pesa
**2,43 kB** gzip. Un panel con acceso, rutas, tabla filtrable y componentes,
5,69 kB más 1,39 kB de CSS.

## Cuándo encaja, y cuándo no

Encaja si quieres que el HTML se lea como HTML, que el bundle se mida en
kilobytes de un dígito y que cada pieza se pueda auditar en una tarde: el
runtime son tres archivos y el modelo reactivo cabe en
[una página](/docs/reactividad/).

No encaja si necesitas el ecosistema de React —sus componentes, sus hooks, JSX—
o Server Components: son [no-objetivos](/docs/decisiones/), no cosas
pendientes.

## Por dónde seguir

- [Primeros pasos](/docs/primeros-pasos/): instalar, configurar Vite y montar
  el primer componente.
- [Reactividad](/docs/reactividad/): `signal`, `memo` y `effect`, que es todo
  el modelo.
- [SSR e islas](/docs/ssr/): páginas que llegan hechas desde el servidor y se
  activan en el cliente.
