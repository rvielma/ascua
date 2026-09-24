---
titulo: Estilos
descripcion: Un <style> dentro de la plantilla es CSS con scope, extraído al compilar. Al navegador no llega ningún runtime de estilos.
---

## CSS con scope

```ts
function Nota(props: { texto: string }) {
  return view`
    <p class="nota">
      ${props.texto}
      <style>
        .nota { color: #888; font-size: .9em; }
        .nota::before { content: "※ "; }
      </style>
    </p>`;
}
```

El compilador saca ese `<style>` de la plantilla, marca cada elemento de ella
con un atributo propio —`data-ascua-14e0cb8f`— y reescribe los selectores
para que solo encajen con esos elementos:

```css
.nota[data-ascua-14e0cb8f] { color: #888; font-size: .9em; }
.nota[data-ascua-14e0cb8f]::before { content: "※ "; }
```

`.nota` en otro componente no se entera. Y como el atributo se deriva del
contenido del CSS, dos componentes con estilos distintos nunca comparten
scope.

## Qué hace Vite con él

El plugin entrega cada hoja como un módulo CSS más. En desarrollo Vite la
inyecta y la recarga al guardar; en el build la extrae a un `.css` junto al
resto. **No queda nada de estilos en el JavaScript**: ni un objeto de clases,
ni un `<style>` que se inserte al montar.

## En el servidor

Con [SSR](/docs/ssr/#estilos), el CSS de los componentes que solo se renderizan
en el servidor no va al bundle del cliente: `collectStyles` lo devuelve con cada
página, y solo el de lo que aparece en ella.

## El scope es por plantilla

Tres consecuencias que conviene tener presentes:

1. **El CSS de un componente no alcanza a los nodos de sus hijos.** Cada
   componente trae sus estilos, y nada se filtra hacia dentro. Para dar estilo
   a lo que se recibe en `children`, que lo traiga quien lo escribe.
2. **Una plantilla anidada es otra plantilla**, con su propio scope: el
   `render` de un `<For>` lleva sus estilos dentro de él.
3. **Los nodos creados a mano** con `element()` no llevan el atributo del scope.

## Estilos globales

Lo que tiene que valer para toda la página —variables, tipografía, el reset—
va en un `.css` normal, importado desde el código o enlazado desde el HTML.
Vite lo trata como siempre:

```ts
import "./estilos.css";
```

Las variables CSS atraviesan el scope sin problemas: un componente puede usar
`var(--acento)` definida en `:root`.

## Estilos que cambian

El CSS se extrae al compilar, así que dentro de un `<style>` no hay `${…}`.
Lo que cambia con el estado va en un atributo, una clase o una variable CSS:

```ts
view`
  <div class="barra" class:llena=${() => progreso() >= 100}
       style=${() => `--progreso: ${progreso()}%`}>
    <style>
      .barra { width: var(--progreso); transition: width .2s; }
      .llena { background: seagreen; }
    </style>
  </div>`;
```
