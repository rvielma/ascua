---
titulo: "ascua-router"
descripcion: Las siete funciones del router, con su firma.
---

```ts
import { coincide, enlaces, enrutarEn, navegar, query, ruta, sinQuery } from "ascua-router";
```

0,98 kB gzip. Depende de `ascua`. La guía está en
[Rutas](/docs/router/).

## ruta

```ts
function ruta(): string;
```

La ruta actual, con su query: `/pedidos?orden=fecha`. Reactiva.

## navegar

```ts
function navegar(destino: string, opciones?: { reemplazar?: boolean }): void;
```

Cambia de ruta sin recargar. Con `reemplazar`, sustituye la entrada del
historial en vez de apilar una nueva.

## enlaces

```ts
function enlaces(raiz?: Node): () => void;
```

Intercepta los clicks en `<a href>` internos dentro de `raiz` —el documento,
por defecto—. Deja pasar los clicks con modificadores, el botón central, los
enlaces con `target` o `download` y los de otro origen. Devuelve cómo soltarlo.

## enrutarEn

```ts
interface Ruta {
  patron?: string;
  vista: (parametros: Parametros) => Node;
}

function enrutarEn(padre: Node, rutas: readonly Ruta[]): () => void;
```

Monta en `padre` la vista de la primera ruta que encaje. Una ruta sin `patron`
encaja siempre. Devuelve cómo soltarla.

## coincide

```ts
type Parametros = Record<string, string>;

function coincide(patron: string, contra?: string): Parametros | null;
```

Los parámetros que captura `patron` en `contra` —la ruta actual, por
defecto—, o `null` si no encaja. `:nombre` captura un segmento y `*` el resto,
en `resto`.

## query

```ts
function query(): URLSearchParams;
```

Lo que va tras `?`, parseado. Reactiva.

## sinQuery

```ts
function sinQuery(valor: string): string;
```

El camino sin la query.
