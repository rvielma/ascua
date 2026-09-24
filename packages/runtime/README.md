# ascua

Reactividad fine-grained y operaciones directas de DOM, en **2,23 kB gzip** y sin
dependencias. Es el runtime de [Ascua](https://ascua.gitweave.run), y también
una librería de signals que se puede usar sola.

```sh
stil add ascua      # o npm install ascua
```

## Signals

```ts
import { signal, memo, effect, batch } from "ascua";

const precio = signal(1000);
const cantidad = signal(3);
const total = memo(() => precio() * cantidad());

effect(() => console.log(total()));   // 3000

batch(() => {                          // un solo recálculo, no dos
  precio.set(1200);
  cantidad.set(2);
});                                    // 2400
```

Escribir en un signal no ejecuta nada: marca. Los efectos afectados se encolan y
corren cuando la marca termina de propagarse, así que un grafo en diamante no
deja leer valores intermedios y una rama cuyo valor no cambió no recalcula.

## DOM

Las mismas llamadas que emite el compilador de Ascua, y que se pueden escribir a
mano:

```ts
import { element, dynamicText, on, append, mount } from "ascua";

function Contador() {
  const cuenta = signal(0);
  const boton = element("button");
  on(boton, "click", () => cuenta.update((c) => c + 1));
  append(boton, dynamicText(() => `Clicks: ${cuenta()}`));
  return boton;
}

mount(document.body, Contador);
```

`show` sustituye una región, `list` reconcilia por clave —conservando el nodo
de cada clave, y con él el foco y el scroll—, `attribute` y `property` atan un
atributo o una propiedad a una expresión.

## SSR e islas

El mismo código renderiza en el servidor, sin navegador ni dependencias, y el
cliente **adopta** los nodos en vez de rehacerlos:

```ts
// servidor
import { island } from "ascua";
import { collectStyles, renderToString } from "ascua/servidor";

const html = renderToString(() => island("contador", () => Contador(3), "3"));
const css = collectStyles(html);   // el CSS con scope de lo que aparece

// cliente
import { hydrate } from "ascua";

hydrate({ contador: (props) => Contador(Number(props)) });
// { adoptados: 4, creados: 0 }
```

`hydrate` e `island` suben el runtime a 2,99 kB; si no se importan, el
tree-shaking se los lleva. Está explicado en la
[documentación](https://ascua.gitweave.run/docs/ssr/).

## Con plantillas

Lo normal, de todas formas, es no escribir esto: con
[`vite-plugin-ascua`](https://www.npmjs.com/package/vite-plugin-ascua) se
escribe HTML dentro de TypeScript y el compilador lo traduce a estas llamadas.

## Licencia

MIT OR Apache-2.0
