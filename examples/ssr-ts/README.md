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
| `src/islas/` | Los componentes interactivos y cómo se envuelven | Los dos |
| `src/entrada-servidor.ts` | De una URL a HTML con `renderToString` | Servidor |
| `src/entrada-cliente.ts` | `hydrate(ISLAS)` y nada más | Navegador |
| `servidor.js` | HTTP con Node: Vite como middleware en desarrollo, `dist/` en producción | Servidor |

Las páginas no se importan desde el cliente, así que su código no viaja. El
bundle es el runtime más los componentes de las islas: **3,1 kB gzip** para
el contador y el buscador juntos.

## Una isla, paso a paso

En el servidor, el componente se envuelve y sus props viajan en JSON:

```ts
export function IslaContador(props: { inicial: number }) {
  return island("contador", () => Contador(props), JSON.stringify(props));
}
```

En el cliente, `hydrate` encuentra `<ascua-island data-ascua-island="contador">`
y reconstruye el componente con esos props, **adoptando** los nodos que ya
están en lugar de crearlos:

```ts
hydrate({ contador: (props) => Contador(JSON.parse(props)) });
// { adoptados: 4, creados: 0 }
```

En desarrollo, la consola muestra esas dos cifras. Si `creados` deja de ser
cero, el servidor y el cliente construyeron cosas distintas; la página sigue
funcionando, pero conviene mirar por qué.

## Lo que no hace, todavía

- **El CSS con scope de componentes que solo existen en el servidor** no llega
  al navegador: Vite solo lo extrae de lo que importa el cliente. Aquí los
  estilos van en `src/estilos.css`, enlazado desde `index.html`.
- **Navegar entre páginas recarga**: es una aplicación de varias páginas, cada
  una con sus islas.
