---
titulo: Componentes
descripcion: Una función que recibe props y devuelve un nodo. Sin clases, sin ciclo de vida y sin nada que registrar.
---

## Una función, un nodo

```ts
function Saludo(props: { nombre: string }) {
  return view`<p class="saludo">Hola, ${props.nombre}</p>`;
}
```

**La inicial decide: minúscula es HTML, mayúscula es componente.** Dentro de
una plantilla se usa como una etiqueta:

```ts
view`<header><Saludo nombre="Ana"/></header>`;
```

y el compilador lo traduce a `Saludo({ nombre: "Ana" })`, que es exactamente lo
que se puede escribir a mano. No hay clase base, ni `this`, ni registro: la
plantilla no da acceso a nada que no estuviera ya al alcance.

**Un componente se ejecuta una vez.** No hay re-render: lo que cambia después
son los nodos atados a un signal. El cuerpo de la función es el sitio para
crear el estado del componente, sus memos y sus efectos, y todo queda ligado a
su vida: cuando lo que lo contiene se libera, se libera con él.

## Props

Los props llegan **tal cual**: un literal es una cadena, y un `${…}` es esa
expresión, sea o no una closure.

```ts
view`<Tarjeta titulo="Resumen" total=${42} activa=${true}/>`;
// Tarjeta({ titulo: "Resumen", total: 42, activa: true })
```

En un componente, `on…` es un prop más, no un listener del DOM: es el
componente quien decide qué hacer con él.

```ts
view`<Formulario onguardar=${(datos: Datos) => guardar(datos)}/>`;
```

### Props que cambian

Un prop es un valor, así que un número que cambia no «llega» otra vez: el
componente ya se ejecutó. Lo que se pasa es **cómo leerlo**, una función:

```ts
function Metrica(props: { etiqueta: string; valor: () => number }) {
  return view`
    <div class="metrica">
      <span class="valor">${() => props.valor()}</span>
      <span class="etiqueta">${props.etiqueta}</span>
    </div>`;
}

view`<Metrica etiqueta="Pedidos" valor=${() => pedidos().length}/>`;
```

Dentro se reenvía llamándolo dentro de otra closure —`${() => props.valor()}`—,
porque la [regla](/docs/plantillas/#la-regla-unica) mira lo que está escrito, no
el tipo. Pasar el signal entero (`valor=${pedidos}`) también funciona, y le da
al componente la posibilidad de escribirlo.

## Hijos

Lo que va entre la etiqueta de apertura y la de cierre llega en `children`:

```ts
import type { Children } from "ascua";

function Tarjeta(props: { titulo: string; children?: Children }) {
  const caja = view`
    <section class="tarjeta">
      <h2>${props.titulo}</h2>
      <div class="cuerpo"></div>
    </section>`;

  props.children?.(caja.querySelector(".cuerpo")!);
  return caja;
}

view`
  <main>
    <Tarjeta titulo="Resumen">
      <p>Tres pedidos pendientes.</p>
      <Metrica etiqueta="Total" valor=${() => total()}/>
    </Tarjeta>
  </main>`;
```

`children` no son nodos ya construidos, sino **la receta** para construirlos:
una función que recibe el elemento donde deben ir.

```ts
type Children = (padre: Node) => void;
```

Así, el componente decide dónde van —y si van—, y un `<Show>` o un `<For>`
dentro del contenido encuentran el padre real que necesitan para anclarse.

## Estado local y compartido

El estado de un componente es una variable de su función:

```ts
function Acordeon(props: { titulo: string; children?: Children }) {
  const abierto = signal(false);
  …
}
```

El estado compartido es un signal en un módulo, o uno que se pasa por props. No
hay contexto ni proveedor: un signal es un valor, y se comparte como se
comparte cualquier valor.

```ts
// sesion.ts
export const sesion = signal<Sesion | null>(null);
```

## A mano, sin plantilla

Un componente no necesita `view`. Las mismas llamadas que emite el compilador
se pueden escribir directamente, y el resultado es indistinguible:

```ts
import { append, dynamicText, element, on, signal } from "ascua";

function Contador() {
  const cuenta = signal(0);
  const boton = element("button");
  on(boton, "click", () => cuenta.update((c) => c + 1));
  append(boton, dynamicText(() => `Clicks: ${cuenta()}`));
  return boton;
}
```

Sirve para envolver una librería que construye su propio DOM, o para quien
prefiera no pasar por el compilador. Están en la
[referencia del runtime](/docs/api-runtime/#dom).
