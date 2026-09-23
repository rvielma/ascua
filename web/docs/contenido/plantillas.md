---
titulo: Plantillas
descripcion: HTML de verdad dentro de TypeScript. La regla que decide qué es reactivo, y todo lo que se puede escribir en una plantilla.
---

## HTML dentro de TypeScript

```ts
const tarjeta = view`
  <article class="tarjeta">
    <h2>${titulo}</h2>
    <p>${() => resumen()}</p>
  </article>`;
```

`view` no existe en tiempo de ejecución: el compilador la sustituye por las
llamadas que construyen ese árbol. Lo que devuelve es el elemento raíz, un
`HTMLElement` corriente: se puede pasar a cualquier API del DOM.

Los atributos son **los del HTML**: `class`, `for`, `onclick`, `tabindex`. El
marcado de cualquier sitio se copia y se pega tal cual.

## La regla única

**Una closure es reactiva. Cualquier otra expresión se evalúa una vez.**

| Escribes | Qué ocurre |
|---|---|
| `${cuenta()}` | Inserta el valor actual. No vuelve a mirarlo. |
| `${() => cuenta()}` | Crea un efecto: ese texto sigue al signal. |
| `class="fijo"` | Atributo estático. |
| `class=${expresion}` | Se evalúa una vez, al construir. |
| `class=${() => …}` | Atributo reactivo. |
| `onclick=${manejador}` | Listener del DOM. Se quita solo al desmontar. |
| `prop:value=${() => …}` | Escribe la **propiedad**, no el atributo. |
| `class:activa=${() => …}` | Pone y quita **esa** clase, sin tocar las demás. |
| `ref=${(nodo) => …}` | Entrega el elemento recién creado a una función. |

La distinción es **sintáctica**: mirando la plantilla se sabe qué puede
cambiar, sin conocer los tipos. De ahí sale la trampa más fácil de pisar:

```ts
function Metrica(props: { valor: () => string }) {
  return view`<span>${props.valor}</span>`;        // ✗ pinta «() => …»
  return view`<span>${() => props.valor()}</span>`; // ✓ sigue al dato
}
```

`props.valor` **es** una función, pero ahí no hay una closure escrita, y la
regla mira lo que está escrito. Un valor reactivo se reenvía llamándolo dentro
de otra closure.

## Texto

Un hueco dentro de una etiqueta es **siempre texto**, escapado:

```ts
view`<p>${"<b>no es negrita</b>"}</p>`;   // se ve el texto tal cual
```

`null` y `undefined` pintan una cadena vacía; todo lo demás pasa por
`String()`. Para componer nodos no se usa un hueco sino un
[componente](/docs/componentes/).

## Atributos

Un atributo reactivo con `false`, `null` o `undefined` **desaparece**, y con
`true` queda vacío. Así se expresan los booleanos del HTML, que existen o no
existen:

```ts
view`<button disabled=${() => enviando()}>Guardar</button>`;
// enviando() === true  →  <button disabled>
// enviando() === false →  <button>
```

## Eventos

```ts
view`<input oninput=${(e: Event) => texto.set((e.target as HTMLInputElement).value)}>`;
```

`on` + el nombre del evento del DOM, en minúsculas: `onclick`, `oninput`,
`onsubmit`, `onkeydown`. Es un `addEventListener` normal —el manejador recibe
el evento del navegador— y se quita solo cuando el componente se libera.

## Formularios: `prop:`

El atributo `value` de un `<input>` es su valor **inicial**: deja de mandar en
cuanto el usuario teclea. La propiedad manda siempre. Por eso `value`,
`checked` y `selected` se escriben con `prop:`:

```ts
const texto = signal("");

view`
  <form onsubmit=${enviar}>
    <input prop:value=${() => texto()}
           oninput=${(e: Event) => texto.set((e.target as HTMLInputElement).value)}>
    <button type="button" onclick=${() => texto.set("")}>Vaciar</button>
  </form>`;
```

Con `value=` en vez de `prop:value=`, el botón de vaciar dejaría de funcionar
en cuanto alguien escribiera.

## Clases que van y vienen: `class:`

`class` es un atributo como otro cualquiera: hacerlo reactivo obliga a
construir la lista entera en cada cambio. Para una clase suelta está `class:`:

```ts
view`<li class="fila" class:hecha=${() => tarea.hecha()}>…</li>`;
```

`fila` se queda siempre, `hecha` aparece y desaparece, y el scope del CSS no se
pisa.

## Quedarse con un nodo: `ref`

```ts
let campo: HTMLInputElement | undefined;

const formulario = view`
  <form>
    <input ref=${(nodo: HTMLInputElement) => (campo = nodo)}>
  </form>`;

campo?.focus();
```

El compilador llama a `ref` justo después de crear el elemento. Se ejecuta en
cada construcción: tras un `<Show>` que reconstruye, la variable apunta al nodo
nuevo.

## Límites, y por qué

- **Una plantilla tiene un único elemento raíz.** Es lo que permite que montar,
  desmontar e hidratar sean operaciones sobre *un* nodo. Donde los fragmentos
  hacen falta —el contenido de un componente, una rama de `<Show>`— sí están.
- **`${expr}` nunca inserta un nodo.** Distinguir por el tipo del valor sería
  adivinar la intención; para componer, un componente.
- **`<Show>` y `<For>` necesitan un elemento padre** donde anclarse, porque lo
  que producen es un marcador dentro de él. No pueden ser la raíz.
- **Los espacios entre etiquetas no cuentan.** Un texto que es solo espacios
  entre dos elementos se descarta, como hace cualquier minificador de HTML. Si
  un espacio importa, va dentro del texto: `<b>uno</b>${" "}<b>dos</b>`.

## `html`, para que el editor coloree

Una plantilla es una cadena, así que el editor no colorea el marcado por su
cuenta. Las extensiones que sí lo hacen —lit-html, es6-string-html— buscan la
etiqueta `html`, y el compilador acepta los dos nombres:

```ts
const boton = html`<button class="grande">Hola</button>`;   // igual que view
```

## Qué sale del compilador

```ts
view`<p>${() => cuenta()}</p>`;
```

se compila a:

```js
const _n0 = _$el("p");
const _n1 = _$dtxt(() => cuenta());
_$add(_n0, _n1);
```

Crear el elemento, crear un texto atado a la expresión, meterlo dentro. Se
puede ver con cualquier archivo en el [playground](/playground/). Es una
propiedad buscada: si el resultado del compilador no se puede leer, la magia
volvió por la puerta de atrás.
