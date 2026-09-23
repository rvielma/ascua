# @ascua/testing

Lo justo para probar un componente de [Ascua](https://ascua.gitweave.run):
montarlo, tocarlo y desmontarlo.

```sh
stil add -D @ascua/testing      # o npm install -D @ascua/testing
```

```ts
import { afterEach, expect, it } from "vitest";
import { escribir, limpiar, pulsar, render } from "@ascua/testing";

import { Acceso } from "./acceso.js";

afterEach(limpiar);

it("no deja entrar sin contraseña", () => {
  const { buscar, texto } = render(() => Acceso({ onentrar: () => {} }));

  escribir(buscar<HTMLInputElement>("input[name=usuario]"), "ana");
  pulsar(buscar("button"));

  expect(texto(".error")).toBe("Falta la contraseña.");
});
```

**No hay que esperar a nada.** En Ascua los efectos corren en el momento de
escribir el signal, no en un `tick` posterior: se pulsa un botón y en la línea
siguiente el DOM ya cambió. `esperar()` solo hace falta cuando lo que se prueba
tiene promesas por medio.

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

`render` devuelve `contenedor`, `buscar`, `buscarTodos`, `texto` y `desmontar`.
`buscar` falla con lo que hay montado delante cuando el selector no encuentra
nada, que ahorra el paso de ir a mirar.

`limpiar` no es opcional: sin él, los efectos del test anterior siguen vivos y
escribiendo en nodos que ya no están, y el fallo aparece dos tests más tarde y
en otro sitio.

## Con plantillas

Los tests de un componente con `view` necesitan que alguien compile las
plantillas, igual que la aplicación. En Vitest, el plugin:

```ts
// vitest.config.ts
import ascua from "@ascua/vite-plugin";

export default {
  plugins: [ascua()],
  test: { environment: "happy-dom" },
};
```

## Licencia

MIT OR Apache-2.0
