---
titulo: Show y For
descripcion: Contenido que aparece y desaparece, y listas con clave que conservan cada nodo mientras su clave siga ahí.
---

## `<Show>`

```ts
view`
  <div class="app">
    <Show when=${() => sesion() !== null}>
      <Panel sesion=${() => sesion()!}/>
      <Else>
        <Login onentrar=${(s: Sesion) => sesion.set(s)}/>
      </Else>
    </Show>
  </div>`;
```

`when` es lo único reactivo. Cada rama se construye **cuando se muestra**: la
que no está visible no existe todavía, ni sus nodos ni sus efectos. Al cambiar
la condición, la rama anterior se libera entera —efectos, memos, listeners,
`onCleanup`— y se construye la otra.

Si `when` devuelve el mismo valor que ya tenía, no se reconstruye nada:
alternar un booleano que ya era `true` no toca el DOM. Se compara el **valor**,
no su veracidad: si `when` pasa de `1` a `2`, la rama se reconstruye aunque las
dos sean verdaderas. Para evitarlo, que devuelva un booleano:
`when=${() => items().length > 0}`.

`<Else>` es opcional, va dentro del `<Show>` y solo puede haber uno. Una rama
puede tener varios nodos hermanos.

## `<For>`

```ts
view`
  <ul class="tareas">
    <For each=${() => tareas()}
         key=${(t: Tarea) => t.id}
         render=${(t: Tarea) => view`<li>${t.titulo}</li>`}/>
  </ul>`;
```

| Prop | Qué es |
|---|---|
| `each` | Una closure que devuelve el array. Es lo reactivo. |
| `key` | Qué identifica a cada item. Tiene que ser única. |
| `render` | Construye el nodo de **un** item. |

`render` se ejecuta **una vez por clave**. Mientras una clave siga en la lista,
su nodo se conserva y, si hace falta, se mueve; no se reconstruye. Eso preserva
lo que el framework no controla: el foco, la selección, el scroll, un
`<input>` a medio escribir.

### Mover lo mínimo

Cuando la lista cambia de orden, las filas que siguen en el mismo orden
relativo se quedan quietas y solo se mueven las demás —las que quedan fuera de
la subsecuencia creciente más larga de las posiciones anteriores—.
Intercambiar dos filas de mil son **dos** movimientos de DOM; mover una al
final, **uno**. Y vaciar una lista que está sola en su padre es una sola
operación, no mil.

### Items que cambian

Como el nodo de cada clave no se rehace, **para que el contenido de un item
cambie, el item tiene que leer un signal por su cuenta**:

```ts
interface Pedido {
  id: number;
  estado: Signal<"pendiente" | "enviado">;
}

render=${(p: Pedido) => view`
  <li data-estado=${() => p.estado()}>#${p.id}: ${() => p.estado()}</li>`}
```

Avanzar un pedido escribe en un texto y en un atributo, y ni la lista ni las
demás filas se enteran. Reemplazar el objeto entero por otro con la misma clave
**no** repinta la fila: para el `<For>` es la misma.

### La fila seleccionada

Si cada fila lee un signal de «cuál está elegida», cambiarla despierta a todas.
Para eso está [`selector`](/docs/reactividad/#selector-elegir-uno-entre-mil):
cada fila escucha solo su clave.

## Dónde anclarlos

`<Show>` y `<For>` dejan un marcador invisible —un comentario— dentro de su
padre y colocan su contenido delante de él. Por eso necesitan **un elemento
padre**: no pueden ser la raíz de una plantilla. Pueden compartir padre con
otros nodos.

```ts
view`<Show when=${…}>…</Show>`;                    // ✗ sin padre
view`<section><Show when=${…}>…</Show></section>`; // ✓
```
