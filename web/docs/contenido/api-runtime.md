---
titulo: "ascua"
descripcion: Cada función que exporta el runtime, con su firma. Signals, operaciones de DOM, SSR e hidratación.
---

```ts
import { signal, memo, effect, mount, hydrate } from "ascua";
import { renderToString } from "ascua/servidor";
```

2,23 kB gzip, sin dependencias. Con `hydrate` e `island`, 2,99 kB; si no se
importan, el tree-shaking se los lleva. `ascua/servidor` no cuenta: no llega
al navegador.

## Reactividad

### signal

```ts
function signal<T>(inicial: T): Signal<T>;

interface Signal<T> {
  (): T;                              // leer y suscribirse
  set(valor: T): void;
  update(fn: (actual: T) => T): void;
  peek(): T;                          // leer sin suscribirse
}
```

Escribir un valor igual al actual (`Object.is`) no avisa a nadie.

### memo

```ts
function memo<T>(calcular: () => T, iguales?: (a: T, b: T) => boolean): () => T;
```

Perezoso: no calcula hasta que alguien lo lee. Si al recalcular obtiene un
valor igual —`Object.is` o `iguales`—, sus observadores no se enteran.

### effect

```ts
function effect(fn: () => void): void;
```

Se ejecuta al crearse y tras cada cambio que le afecte. Pertenece al scope
actual y se libera con él.

### batch

```ts
function batch<T>(fn: () => T): T;
```

Las escrituras de dentro producen como mucho una ejecución por efecto afectado.

### untrack

```ts
function untrack<T>(fn: () => T): T;
```

Ejecuta `fn` sin suscribir al cómputo actual a lo que lea.

### selector

```ts
function selector<T>(fuente: () => T): (clave: T) => boolean;
```

`esLaElegida(clave)` vale `true` para la clave que devuelve `fuente`. Cada
lector se suscribe solo a su clave: un cambio avisa a la que deja de estar
elegida y a la que pasa a estarlo.

### onCleanup

```ts
function onCleanup(fn: () => void): void;
```

Corre antes de cada reejecución del scope actual y al liberarlo. Fuera de todo
scope no hace nada.

### onError

```ts
function onError(manejador: (error: unknown) => void): void;
```

Se hace cargo de los errores de este scope y de los de debajo. El manejador
corre en su propio scope. Ver [Errores](/docs/errores/).

### root

```ts
function root<T>(fn: () => T): [T, () => void];
```

Una raíz reactiva propia: devuelve el resultado y cómo liberarla entera.

### currentScope, withScope

```ts
function currentScope(): Scope;
function withScope<T>(scope: Scope, fn: () => T): T;
```

Capturar el scope actual y volver a él más tarde; sirve tras un `await`.

## DOM

Las llamadas que emite el compilador. Se pueden escribir a mano.

| Función | Qué hace |
|---|---|
| `element(etiqueta)` | `document.createElement`. |
| `text(contenido?)` | Un nodo de texto. |
| `marker()` | Un comentario vacío: el ancla de una región dinámica. |
| `append(padre, ...hijos)` | Añade al final. |
| `insert(padre, hijo, antes)` | `insertBefore`. |
| `dynamicText(calcular)` | Un texto atado a una expresión. Devuelve el nodo. |
| `attribute(nodo, nombre, calcular)` | Atributo reactivo. `false`, `null` o `undefined` lo quitan; `true` lo deja vacío. |
| `staticAttribute(nodo, nombre, valor)` | Lo mismo, una vez. |
| `property(nodo, nombre, calcular)` | Propiedad reactiva: `value`, `checked`. |
| `cssClass(nodo, nombre, calcular)` | Pone o quita una clase. |
| `on(nodo, evento, manejador)` | `addEventListener`, que se quita solo al liberar. |

### show

```ts
function show<T>(
  padre: Node,
  elegir: () => T,
  construir: (valor: T) => Node | readonly Node[] | null,
): void;
```

La región de un `<Show>`. `construir` corre dentro de un scope propio y sin
rastrear; se vuelve a llamar solo cuando `elegir` devuelve otro valor.

### list

```ts
function list<T, K>(
  padre: Node,
  items: () => readonly T[],
  clave: (item: T) => K,
  construir: (item: T) => Node,
): void;
```

La lista de un `<For>`. `construir` se ejecuta una vez por clave; los nodos se
conservan y se mueven lo mínimo.

### mount

```ts
function mount(padre: Node, construir: () => Node): () => void;
```

Construye dentro de una raíz reactiva, lo añade a `padre` y devuelve cómo
desmontarlo.

## SSR e hidratación

### island

```ts
function island(nombre: string, construir: () => Node, props?: string): HTMLElement;
```

Envuelve el contenido en `<ascua-island>`. En el servidor numera lo de dentro;
en el cliente, si se está hidratando, lo adopta.

### hydrate

```ts
function hydrate(
  islas: Record<string, (props: string) => Node>,
  raiz?: ParentNode,
): { adoptados: number; creados: number; desmontar: () => void };
```

Activa las islas de `raiz` —el documento, por defecto— adoptando los nodos del
servidor. Las islas sin constructor se dejan intactas.

### renderToString

```ts
import { renderToString } from "ascua/servidor";

function renderToString(construir: () => Node): string;
```

Renderiza a HTML sobre un documento en memoria, sin navegador. Los efectos
corren una vez y se liberan al terminar.

### collectStyles

```ts
import { collectStyles } from "ascua/servidor";

function collectStyles(html: string): string;
```

El CSS con scope de los componentes que aparecen en un HTML ya renderizado. Las
hojas las registra el plugin de Vite al cargar cada módulo en el servidor, con
`registerStyle`, que no hace falta llamar a mano.

## Tipos

```ts
type Children = (padre: Node) => void;
type ValorAtributo = string | number | boolean | null | undefined;
type Memo<T> = () => T;
```

Y dos globales, para que el editor conozca las plantillas sin importarlas:

```ts
declare global {
  function view(plantilla: TemplateStringsArray, ...valores: unknown[]): HTMLElement;
  function html(plantilla: TemplateStringsArray, ...valores: unknown[]): HTMLElement;
}
```
