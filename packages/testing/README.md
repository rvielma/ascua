# ascua-testing

Lo justo para probar un componente de [Ascua](https://ascua.gitweave.run):
montarlo, tocarlo y desmontarlo.

```sh
stil add -D ascua-testing      # o npm install -D ascua-testing
```

```ts
import { afterEach, expect, it } from "vitest";
import { cleanup, click, input, render } from "ascua-testing";

import { Acceso } from "./acceso.js";

afterEach(cleanup);

it("no deja entrar sin contraseña", () => {
  const { get, text } = render(() => Acceso({ onentrar: () => {} }));

  input(get<HTMLInputElement>("input[name=usuario]"), "ana");
  click(get("button"));

  expect(text(".error")).toBe("Falta la contraseña.");
});
```

**No hay que esperar a nada.** En Ascua los efectos corren en el momento de
escribir el signal, no en un `tick` posterior: se pulsa un botón y en la línea
siguiente el DOM ya cambió. `wait()` y `waitFor()` solo hacen falta cuando lo
que se prueba tiene promesas por medio.

## Lo que hay

| | |
|---|---|
| `render(construir)` | Monta en un contenedor propio, dentro del documento. |
| `cleanup()` | Desmonta todo lo renderizado. Va en un `afterEach`. |
| `click(nodo)` | Un click de los que el DOM propaga. |
| `input(campo, valor)` | Cambia el valor **y avisa** con `input`. |
| `check(casilla, checked?)` | Con su evento `change`. |
| `submit(formulario)` | Un `submit` cancelable. |
| `drag(nodo, puntos, options?)` | `pointerdown`, `pointermove` y `pointerup` (o `pointercancel` con `cancel: true`). |
| `wait(ms?)` | Cede el turno a las promesas pendientes. |
| `waitFor(selector, { within?, timeout? })` | Espera a que aparezca un nodo y lo devuelve; falla a los 1000 ms con lo que había. |

`render` devuelve `container`, `get`, `getAll`, `text`, `waitFor` (limitado a
lo montado) y `unmount`. `get` falla con lo que hay montado delante cuando el
selector no encuentra nada, que ahorra el paso de ir a mirar.

```ts
const { waitFor } = render(() => Pedido({ id: "4821" }));
const fila = await waitFor(".linea");   // el resource ya cargó
```

`cleanup` no es opcional: sin él, los efectos del test anterior siguen vivos y
escribiendo en nodos que ya no están, y el fallo aparece dos tests más tarde y
en otro sitio.

## Con plantillas

Los tests de un componente con `view` necesitan que alguien compile las
plantillas, igual que la aplicación. En Vitest, el plugin:

```ts
// vitest.config.ts
import ascua from "vite-plugin-ascua";

export default {
  plugins: [ascua()],
  test: { environment: "happy-dom" },
};
```

## Licencia

MIT OR Apache-2.0
