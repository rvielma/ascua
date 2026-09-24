---
titulo: "ascua-testing"
descripcion: Montar, tocar y desmontar un componente en un test. Siete funciones.
---

```ts
import { enviar, escribir, esperar, limpiar, marcar, pulsar, render } from "ascua-testing";
```

Funciona con cualquier runner que tenga un DOM —Vitest con happy-dom, jsdom—.
La guía está en [Tests](/docs/testing/).

## render

```ts
function render(construir: () => Node): Montaje;

interface Montaje {
  contenedor: HTMLElement;
  buscar<T extends Element = HTMLElement>(selector: string): T;
  buscarTodos<T extends Element = HTMLElement>(selector: string): T[];
  texto(selector?: string): string;
  desmontar(): void;
}
```

Monta en un contenedor propio, añadido al documento: el foco, `closest` y las
medidas solo funcionan ahí. `buscar` falla con el HTML montado en el mensaje
cuando el selector no encuentra nada.

## limpiar

```ts
function limpiar(): void;
```

Desmonta todo lo montado con `render`. Va en un `afterEach`.

## pulsar

```ts
function pulsar(nodo: Element): void;
```

Un `click` que burbujea, como el de un usuario.

## escribir

```ts
function escribir(campo: HTMLInputElement | HTMLTextAreaElement, valor: string): void;
```

Cambia el valor y dispara `input`.

## marcar

```ts
function marcar(casilla: HTMLInputElement, marcada?: boolean): void;
```

Cambia `checked` y dispara `change`.

## enviar

```ts
function enviar(formulario: HTMLFormElement): void;
```

Un `submit` cancelable, como el de pulsar Enter.

## esperar

```ts
function esperar(milisegundos?: number): Promise<void>;
```

Cede el turno para que corran las promesas pendientes. Solo hace falta si lo
que se prueba es asíncrono: los efectos no lo son.
