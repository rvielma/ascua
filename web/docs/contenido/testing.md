---
titulo: Tests
descripcion: Montar un componente, tocarlo y mirar el DOM. Sin esperas, porque los efectos corren en el momento.
---

## Configurar Vitest

Los tests de un componente con plantillas necesitan que alguien las compile,
igual que la aplicación. En Vitest, el mismo plugin:

```ts
// vitest.config.ts
import ascua from "vite-plugin-ascua";

export default {
  plugins: [ascua()],
  test: { environment: "happy-dom" },
};
```

```sh
stil add -D ascua-testing
stil add -D vitest
stil add -D happy-dom
```

## Un test

```ts
import { afterEach, expect, it } from "vitest";
import { escribir, limpiar, pulsar, render } from "ascua-testing";

import { Acceso } from "./acceso.js";

afterEach(limpiar);

it("no deja entrar sin contraseña", () => {
  const { buscar, texto } = render(() => Acceso({ onentrar: () => {} }));

  escribir(buscar<HTMLInputElement>("input[name=usuario]"), "ana");
  pulsar(buscar("button"));

  expect(texto(".error")).toBe("Falta la contraseña.");
});
```

**No hay que esperar a nada.** En Ascua los efectos corren al escribir el
signal, no en un `tick` posterior: se pulsa un botón y en la línea siguiente el
DOM ya cambió. `esperar()` solo hace falta cuando lo que se prueba tiene
promesas por medio.

## Lo que hay

| | |
|---|---|
| `render(construir)` | Monta en un contenedor propio, dentro del documento. |
| `limpiar()` | Desmonta todo lo renderizado. Va en un `afterEach`. |
| `pulsar(nodo)` | Un click de los que el DOM propaga. |
| `escribir(campo, valor)` | Cambia el valor **y avisa** con `input`. |
| `marcar(casilla, marcada?)` | Con su evento `change`. |
| `enviar(formulario)` | Un `submit` cancelable. |
| `esperar(ms?)` | Cede el turno a las promesas pendientes. |

`render` devuelve `contenedor`, `buscar`, `buscarTodos`, `texto` y
`desmontar`. `buscar` falla con lo que hay montado delante cuando el selector no
encuentra nada, que ahorra el paso de ir a mirar.

`limpiar` no es opcional: sin él, los efectos del test anterior siguen vivos y
escribiendo en nodos que ya no están, y el fallo aparece dos tests más tarde y
en otro sitio.

## Qué probar

Lo que ve quien usa la aplicación: el texto, si un botón está deshabilitado, qué
aparece tras un click. No el estado interno de un componente, que es suyo y
puede cambiar sin que cambie lo que hace.

Como un componente se ejecuta una vez y los nodos se actualizan en su sitio,
se puede comprobar algo que en otros frameworks no se puede: que el nodo **es
el mismo** después del cambio.

```ts
const salida = buscar("output");
pulsar(buscar(".mas"));
expect(buscar("output")).toBe(salida);   // no se rehízo
expect(salida.textContent).toBe("1");
```

## SSR

Una página renderizada con [`renderToString`](/docs/ssr/) se prueba metiendo
el HTML en el documento, como haría el navegador, e hidratando:

```ts
document.body.innerHTML = render("/lenguajes").html;
const { creados } = hydrate(ISLAS);
expect(creados).toBe(0);
```
