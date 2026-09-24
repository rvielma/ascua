---
titulo: Errores y depuración
descripcion: onError para que un fallo no se lleve la aplicación, source maps que señalan tu archivo y los mensajes del compilador.
---

## Cuando una vista falla

Un error dentro de un efecto se lleva por delante lo que lo rodea, a menos que
alguien se haga cargo. `onError` registra quién:

```ts
import { onError, signal } from "ascua";

function Seccion() {
  const fallo = signal<string | null>(null);
  onError((error) => fallo.set(String(error)));

  return view`
    <section>
      <Show when=${() => fallo() === null}>
        <Contenido/>
        <Else><p class="error">${() => fallo()}</p></Else>
      </Show>
    </section>`;
}
```

El error sube por los dueños —el efecto que falló, el componente que lo creó,
el que contiene a ese— hasta el primero que tenga un `onError`. El manejador
corre en **su** scope, no en el que falló, así que lo que escriba sobrevive a
lo que se está derrumbando. Sin ninguno registrado, el error se propaga como
siempre: nada se traga en silencio.

## Source maps

El compilador emite un source map, así que un error del navegador señala el
archivo que escribiste y no el que salió del compilador. Lo que se copia sin
tocar —casi todo— apunta a su línea exacta; lo que genera una plantilla apunta
a la línea del `view` que lo produjo, que es donde hay que mirar.

El mapa lleva dentro el TypeScript original, de modo que las herramientas del
navegador lo enseñan aunque el archivo no esté servido. Con el plugin de Vite
no hay que hacer nada.

## Errores de compilación

Salen por la vía de siempre —la consola de Vite, el overlay del navegador— con
la línea de la plantilla que los causó:

```text
ascuac: línea 42: <For> necesita `render`: <For each=${() => items()} …/>
```

## Lo que suele fallar

**Un texto que no se actualiza.** Falta la closure: `${cuenta()}` se evalúa
una vez; `${() => cuenta()}` sigue al signal. Lo mismo con un prop:
`${props.valor}` pinta la función, `${() => props.valor()}` la llama.

**Un input que no se vacía desde el código.** Está escrito `value=` y tiene
que ser `prop:value=`. El atributo es solo el valor inicial.

**Un array que cambió y nadie se enteró.** Se mutó por dentro (`push`,
`splice`, `lista[i] = …`). Un signal avisa cuando recibe **otro** valor:
`tareas.update((l) => [...l, nueva])`.

**Una fila de `<For>` que no refleja un cambio.** El nodo de cada clave se
construye una vez. Lo que cambie dentro de un item tiene que leerse de un
signal del propio item.

**Efectos que siguen vivos en los tests.** Falta `afterEach(limpiar)`.

**Tras un `await`, un efecto que no se libera.** El scope se perdió en el
salto. Se captura con `currentScope()` antes y se restaura con `withScope`.
Está en [Reactividad](/docs/reactividad/#codigo-asincrono).

**`creados` no es cero al hidratar.** El servidor y el cliente construyeron
cosas distintas: props diferentes, una fecha o un número aleatorio calculado
en los dos lados, o algo que depende de `window`.
