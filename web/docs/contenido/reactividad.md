---
titulo: Reactividad
descripcion: signal, memo y effect son todo el modelo. Cómo se suscriben solos, cuándo se ejecutan y cómo se liberan.
---

## Tres primitivos

| | Qué es | Tiene valor | Se recalcula |
|---|---|---|---|
| `signal` | Estado. Lo único que se escribe. | Sí | Nunca |
| `memo` | Un valor derivado de otros. | Sí | Perezosamente, al leerlo |
| `effect` | Trabajo con efectos: tocar el DOM, un `fetch`, un log. | No | Tras la escritura que lo afecta |

```ts
import { effect, memo, signal } from "@ascua/runtime";

const precio = signal(1000);
const cantidad = signal(3);
const total = memo(() => precio() * cantidad());

effect(() => console.log(`Total: ${total()}`));   // Total: 3000
cantidad.set(4);                                   // Total: 4000
```

Nadie declaró que `total` depende de `precio` y `cantidad`, ni que el efecto
depende de `total`. **Se descubre leyendo**: mientras un memo o un efecto se
ejecuta, el runtime anota qué leyó. Si la próxima vez lee otras cosas —una rama
de un `if` que cambió—, se suscribe a esas y deja de escuchar a las anteriores.

## signal

```ts
const nombre = signal("Ana");

nombre();                        // leer, y suscribirse si hay alguien escuchando
nombre.set("Luis");              // escribir
nombre.update((n) => n.trim());  // escribir a partir del valor actual
nombre.peek();                   // leer sin suscribirse
```

Escribir el mismo valor que ya tenía (`Object.is`) no despierta a nadie.

Un signal guarda **una referencia**: mutar un array o un objeto por dentro no
avisa. Se escribe uno nuevo:

```ts
const tareas = signal<Tarea[]>([]);

tareas.update((lista) => [...lista, nueva]);   // ✓ avisa
tareas().push(nueva);                           // ✗ nadie se entera
```

## memo

```ts
const visibles = memo(() => tareas().filter((t) => !t.hecha));
```

Un memo es **perezoso**: no calcula hasta que alguien lo lee, y no vuelve a
calcular mientras sus fuentes no cambien. Y **corta la propagación**: si al
recalcular obtiene el mismo valor, quien lo lee no se entera.

```ts
const esGrande = memo(() => cuenta() > 100);
// cuenta: 1 → 2 → 3 … → 100: esGrande sigue siendo false y nadie repinta.
```

El segundo argumento cambia qué se considera «el mismo valor»:

```ts
const punto = memo(() => ({ x: x(), y: y() }), (a, b) => a.x === b.x && a.y === b.y);
```

## effect

```ts
effect(() => {
  document.title = `${pendientes()} pendientes`;
});
```

Se ejecuta una vez al crearse y otra por cada cambio que le afecte. En una
plantilla casi nunca se escribe a mano: cada `${() => …}` **es** un efecto que
el compilador pone por ti.

### Limpieza

```ts
effect(() => {
  const id = setInterval(tick, intervalo());
  onCleanup(() => clearInterval(id));
});
```

`onCleanup` corre antes de cada reejecución y una última vez cuando el efecto
se libera. Es la forma de soltar lo que se adquirió: un intervalo, un listener
global, una suscripción.

## Sin estados intermedios

Escribir en un signal **no ejecuta nada**: marca. Primero se marca todo lo que
depende de él, y solo cuando la marca terminó de propagarse corren los efectos.
De ahí salen dos garantías:

- **Un efecto nunca ve un estado a medias.** Si `b` y `c` derivan de `a` y un
  efecto lee los dos, al cambiar `a` el efecto corre una vez y ve los dos
  valores nuevos, nunca uno nuevo y otro viejo.
- **Un efecto corre una vez por cambio**, aunque le lleguen avisos por varios
  caminos.

### batch

Varias escrituras seguidas son varios cambios. `batch` las junta en uno:

```ts
batch(() => {
  precio.set(1200);
  cantidad.set(2);
});
// Total: 2400 — una sola vez, no dos.
```

### untrack

Leer sin suscribirse, cuando un efecto necesita un dato pero no debe
reaccionar a él:

```ts
effect(() => {
  registrar(pagina(), untrack(() => usuario()));   // solo reacciona a pagina
});
```

## Quién es dueño de qué

Todo lo reactivo tiene un dueño: el scope que estaba activo al crearlo.
Liberar un dueño libera todo lo que cuelga de él, en orden.

```ts
const [app, desmontar] = root(() => {
  const cuenta = signal(0);
  effect(() => console.log(cuenta()));
  return cuenta;
});

desmontar();   // el efecto deja de existir y sus onCleanup corren
```

No hace falta llamar a `root` casi nunca: `mount`, `<Show>`, `<For>` y el
router crean los suyos. Cuando una rama de `<Show>` se cierra, todo lo que se
creó dentro —efectos, memos, listeners— se libera con ella. Nada queda vivo
escuchando a un componente que ya no está.

Cuando un efecto se reejecuta, antes de correr libera lo que creó la vez
anterior: un efecto creado dentro de otro efecto no se acumula.

### Código asíncrono

Después de un `await`, el scope ya no es el que era: el código corre en otra
vuelta del bucle de eventos. Si hay que crear algo reactivo ahí, se captura el
scope antes y se restaura:

```ts
const scope = currentScope();
const datos = await fetch(url).then((r) => r.json());
withScope(scope, () => {
  effect(() => …);   // pertenece al componente, y se libera con él
});
```

## selector: elegir uno entre mil

El caso es la fila seleccionada de una tabla. Si cada fila lee el signal de la
selección, cambiarla despierta mil efectos para repintar dos. Con `selector`,
cada fila se suscribe solo a **su** clave:

```ts
const elegida = signal<number | null>(null);
const esLaElegida = selector(() => elegida());

view`<tr class:seleccionada=${() => esLaElegida(fila.id)}>…</tr>`;
```

Cambiar `elegida` avisa a la fila que deja de estarlo y a la que pasa a
estarlo. Las otras 998 ni se enteran.

## Errores

Un error dentro de un efecto sube por los dueños hasta el primero que tenga un
`onError`. Está en [Errores y depuración](/docs/errores/).
