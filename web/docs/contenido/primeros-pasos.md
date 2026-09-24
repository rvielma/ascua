---
titulo: Primeros pasos
descripcion: De un directorio vacío a un componente montado en el navegador, con Vite.
---

> **Cuidado:** los paquetes están listos para npm, pero todavía no se han
> publicado. Hasta entonces, se usan desde el
> [repositorio](https://github.com/rvielma/ascua): los ejemplos de `examples/`
> enlazan `packages/` con un alias de Vite, y es la forma más rápida de probar.

## Instalar

Ascua es una librería de runtime y un plugin de Vite. El compilador viene
dentro del plugin como WebAssembly: no hay binario que descargar ni
`postinstall` que ejecutar.

```sh
stil add ascua
stil add -D vite-plugin-ascua
stil add -D vite
```

Con npm, pnpm o bun es lo mismo: `npm install ascua` y
`npm install -D vite-plugin-ascua vite`.

## Configurar Vite

```ts
// vite.config.ts
import ascua from "vite-plugin-ascua";

export default {
  plugins: [ascua()],
};
```

El plugin hace dos cosas: pasar por el compilador cada archivo que tenga una
plantilla, y entregar a Vite el CSS que sale de sus `<style>`. Todo lo demás
—TypeScript, módulos, el build— lo sigue haciendo Vite.

## El primer componente

```ts
// src/contador.ts
import { signal } from "ascua";

export function Contador(props: { inicial: number }) {
  const cuenta = signal(props.inicial);

  return view`
    <div class="contador">
      <button onclick=${() => cuenta.update((c) => c - 1)}>−</button>
      <output>${() => cuenta()}</output>
      <button onclick=${() => cuenta.update((c) => c + 1)}>+</button>
      <style>
        .contador { display: flex; gap: .5rem; align-items: center; }
        output { min-width: 3ch; text-align: center; }
      </style>
    </div>`;
}
```

Un componente es **una función que devuelve un nodo**. Se ejecuta una vez: lo
que cambia después son los nodos que dependen de un signal, no la función.

## Montarlo

```ts
// src/main.ts
import { mount } from "ascua";

import { Contador } from "./contador.js";

mount(document.getElementById("app")!, () => Contador({ inicial: 0 }));
```

```html
<!-- index.html -->
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

`mount` construye el árbol dentro de una raíz reactiva y devuelve cómo
desmontarlo: quita los nodos y libera cada efecto y listener que los
alimentaba.

```sh
stil exec vite          # desarrollo, con recarga
stil exec vite build    # un .js y un .css en dist/
```

## TypeScript

`view` y `html` están declaradas como globales en `ascua`, así que el
editor las conoce sin importarlas. Si tu `tsconfig.json` no incluye los tipos
del paquete por otra vía, basta con importar algo de él en cualquier archivo.

## Comprobar los tipos

Para TypeScript, lo que va dentro de una plantilla es texto: un prop de otro
tipo no da error. `ascua-check` lo comprueba con el `tsc` del proyecto y señala
cada error en su línea:

```sh
stil add -D ascua-check
stil exec ascua-check
```

Está en [Tipos](/docs/tipos/).

## Estructura de un proyecto

No hay convención de carpetas que seguir: un componente es una función en un
archivo. Los ejemplos del repositorio usan esta, que crece bien:

```text
src/
  main.ts          monta la aplicación
  componentes.ts   las piezas que se repiten
  login.ts         una pantalla por archivo
  panel.ts
  datos.ts         tipos y datos, sin plantillas
```

## Siguientes pasos

- [Plantillas](/docs/plantillas/): qué es reactivo, atributos, eventos,
  formularios.
- [Componentes](/docs/componentes/): props, hijos y cómo pasar datos que
  cambian.
- [Rutas](/docs/router/): cuando la aplicación tiene más de una pantalla.
