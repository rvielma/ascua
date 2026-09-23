---
titulo: Cómo funciona
descripcion: Del archivo .ts al nodo que cambia. El compilador, el grafo reactivo, la reconciliación de listas y la hidratación, por dentro.
---

Ascua tiene tres piezas: un compilador que traduce plantillas a llamadas, un
grafo reactivo que sabe qué depende de qué, y unas pocas operaciones de DOM.
Esta página las recorre en el orden en que actúan.

## 1. El compilador

El compilador no parsea TypeScript entero, y no le hace falta: solo necesita
**localizar** las plantillas y quedarse con lo de dentro. Un escáner recorre el
archivo entendiendo cadenas, comentarios, expresiones regulares y plantillas
anidadas —para no tomar por plantilla un ``view` `` escrito en un comentario—,
y cada plantilla que encuentra pasa por un parser de HTML y un generador de
código. El resto del archivo se copia sin tocar.

```ts
view`<p class="total">Total: ${() => total()}</p>`;
```

```js
const _n0 = _$el("p");
_$sattr(_n0, "class", "total");
const _n1 = _$txt("Total: ");
_$add(_n0, _n1);
const _n2 = _$dtxt(() => total());
_$add(_n0, _n2);
```

Cada punto dinámico es **una llamada que crea un efecto** y captura el nodo
concreto que debe actualizar. No queda plantilla en tiempo de ejecución, ni
árbol que recorrer, ni nada que comparar.

Está escrito en Rust y se distribuye como un único `.wasm` de 83 KB: el mismo
archivo corre en Node, Bun, Deno y el navegador. Sin binarios por plataforma
—SWC publica una decena, esbuild veinte— y sin `postinstall` que descargue
nada al instalar.

## 2. El grafo reactivo

Cada signal, memo y efecto es un nodo que guarda qué leyó (sus fuentes) y
quién lo leyó (sus observadores). Las dependencias se descubren leyendo:
mientras un cómputo corre, el runtime anota cada signal que toca.

### Marcar es barato; recalcular, no

Escribir en un signal **no ejecuta nada**: marca. Cada nodo está en uno de tres
estados:

| Estado | Qué significa |
|---|---|
| limpio | Su valor está al día. |
| sucio | Una fuente directa cambió: hay que recalcular. |
| por comprobar | Algo cambió más arriba: quizá haya que recalcular. |

Un signal marca **sucios** a sus observadores directos, y estos marcan **por
comprobar** a los suyos, hasta el final. Los efectos alcanzados se encolan.
Solo cuando la marca terminó de propagarse se vacía la cola.

Un nodo por comprobar pregunta a sus fuentes antes de hacer nada. Si ninguna
cambió **de valor** —un memo que recalculó y obtuvo lo mismo—, vuelve a limpio
sin ejecutar su cómputo. `cuenta > 100` con `cuenta` pasando de 1 a 2 no
repinta nada.

### El diamante

Es el caso que rompe las implementaciones ingenuas: dos memos derivan del mismo
signal y un efecto lee los dos.

```ts
const a = signal(1);
const b = memo(() => a() + 1);
const c = memo(() => a() * 10);
effect(() => console.log(b(), c()));

a.set(2);
```

Con propagación en cascada, el efecto correría dos veces, y la primera leería
`3, 10`: un estado que nunca existió. Aquí corre **una** vez y lee `3, 20`,
porque marcar y recalcular son fases separadas.

### Memoria: un árbol que se poda

Todo nodo tiene un dueño, el scope activo al crearlo. Liberar un dueño libera
su subárbol entero, en orden: ejecuta sus `onCleanup`, libera sus hijos y borra
sus suscripciones. No hay recuento de referencias que pueda quedar atrapado en
un ciclo; hay un árbol, y se poda.

Cuando un efecto se reejecuta, primero hace lo mismo con lo que creó la vez
anterior. De ahí salen las dependencias dinámicas —una rama que deja de
ejecutarse deja de despertar al efecto— y que un componente desmontado no siga
vivo reaccionando a cambios.

## 3. El DOM

Las operaciones de DOM son funciones pequeñas —crear un elemento, atar un
texto, poner un listener— y la mayoría son un efecto y una escritura. Hay dos
que hacen algo más:

### show

La región de un `<Show>`. Guarda un marcador invisible en el padre y, cuando la
condición cambia de valor, libera el scope de la rama anterior —con todo lo que
colgaba de él— y construye la nueva en uno propio.

### list: la única reconciliación

La de un `<For>`, y el único sitio donde Ascua hace algo parecido a un diff. Es
local —una lista, no el árbol— y acotado:

1. **Fuera lo que ya no está**, del DOM y del grafo. Si no sobrevive ninguna
   clave y la lista está sola en su padre, se vacía de un golpe.
2. **Construir lo nuevo**, una vez por clave, cada uno en su scope.
3. **Colocar moviendo lo mínimo.** Las claves que siguen en el mismo orden
   relativo —la subsecuencia creciente más larga de sus posiciones anteriores,
   en *O(n log n)*— se quedan quietas; el resto se mueve.

Intercambiar dos filas de mil son dos movimientos. Invertir una lista mueve
todos los nodos menos uno, que es el mínimo posible.

## 4. La hidratación

En el servidor, dentro de una isla, cada elemento y cada marcador lleva su
número de orden de construcción. En el cliente, el mismo código construye en el
mismo orden, y el elemento número *n* adopta el elemento número *n* del
documento. Los textos se resuelven por posición dentro de su padre, ya
adoptado. Está en [SSR e islas](/docs/ssr/#como-encuentra-cada-nodo).

## Lo que cuesta

| | gzip |
|---|---|
| El runtime | 2,23 kB |
| El runtime con `hydrate` e `island` | 2,99 kB |
| Una aplicación entera (runtime, contador y lista con clave) | 2,43 kB |
| Un panel con acceso, rutas, tabla filtrable y componentes | 5,69 kB + 1,39 kB de CSS |
| El router | 0,98 kB |
| React + ReactDOM, sin aplicación | ~45 kB |

El código fuente del runtime son tres archivos: `reactivo.ts`, `dom.ts` y
`servidor.ts`. Están escritos para leerse de una sentada.
