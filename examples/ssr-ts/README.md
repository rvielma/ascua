# Ascua con SSR e islas

Páginas que llegan enteras desde el servidor y solo llevan JavaScript donde
hace falta. El texto, la navegación y la lista se ven sin ejecutar nada; el
contador y el filtro son **islas** que el cliente adopta al cargar.

```sh
stil install
stil run dev                       # http://localhost:5173, con HMR
stil run build && stil run start   # producción, desde dist/
stil run test
```

## Cómo está armado

| Archivo | Qué hace | Dónde corre |
|---|---|---|
| `src/paginas.ts` | Las páginas y el marco común | Solo servidor |
| `src/islands/` | Los componentes interactivos y cómo se envuelven | Los dos |
| `src/entrada-servidor.ts` | De una URL a HTML con `renderToString` | Servidor |
| `src/entrada-cliente.ts` | `hydrate(ISLAS)` y nada más | Navegador |
| `servidor.js` | HTTP con Node: Vite como middleware en desarrollo, `dist/` en producción | Servidor |

Las páginas no se importan desde el cliente, así que su código no viaja. El
bundle es el runtime más los componentes de las islas y la validación de sus
props: **4,2 kB gzip** para el contador y el buscador juntos.

## Los estilos de las páginas

El marco de las páginas lleva su propio `<style>`, con scope. Como las páginas
no llegan al cliente, sus estilos tampoco van en el bundle: en el servidor, el
plugin los registra y `collectStyles(html)` devuelve los que usa cada página,
que `servidor.js` pone en un `<style>` en el `<head>`. En `src/estilos.css`
queda lo global: las variables y la tipografía.

## Una isla, paso a paso

Una isla se define una vez, con el esquema de sus props (`src/islands/index.ts`):

```ts
export const IslaContador = defineIsland("contador", { inicial: p.number }, Contador);
```

En el servidor se usa como un componente más —`<IslaContador inicial=${3}/>`—
y deja sus props en JSON dentro de `<ascua-island data-ascua-island="contador">`.

En el cliente, `hydrate` recibe la lista de islas, comprueba los props de cada
una contra su esquema y reconstruye el componente **adoptando** los nodos que
ya están en lugar de crearlos:

```ts
const { adopted, created } = hydrate([IslaContador, IslaBuscador]);
// { adopted: 4, created: 0 }
```

Si los props no encajan con el esquema —otra versión del servidor, un dato mal
convertido—, la isla se queda estática y la consola dice qué campo falló.

En desarrollo, la consola muestra las dos cifras. Si `created` deja de ser
cero, el servidor y el cliente construyeron cosas distintas; la página sigue
funcionando, pero conviene mirar por qué.

## Lo que no hace, todavía

- **Navegar entre páginas recarga**: es una aplicación de varias páginas, cada
  una con sus islas.
