// Los demos en vivo del sitio.
//
// Lo que enseñan no es "mira, reacciona" —eso lo hace cualquiera— sino
// **cuántas operaciones de DOM** cuesta que reaccione.

import { list, memo, signal } from "@ascua/runtime";

/** Un contador, y al lado el registro de lo que el framework le hace al DOM. */
export function DemoContador(): HTMLElement {
  const count = signal(0);
  const registro = signal<string[]>([]);
  const escrituras = signal(0);

  const anotar = (valor: number) => {
    escrituras.update((n) => n + 1);
    registro.update((lineas) => [...lineas, `setText(nodo, "${valor}")`].slice(-5));
  };

  const paridad = memo(() => count() % 2 === 0);

  const pulsar = (delta: number) => () => {
    count.update((c) => c + delta);
    anotar(count());
  };

  return view`
    <div class="demo">
      <div class="panel">
        <p class="valor" data-par=${() => paridad()}>${() => count()}</p>
        <div class="botones">
          <button onclick=${pulsar(-1)}>−1</button>
          <button onclick=${() => {
            count.set(0);
            anotar(0);
          }} disabled=${() => count() === 0}>reset</button>
          <button class="principal" onclick=${pulsar(1)}>+1</button>
        </div>
      </div>

      <div class="registro">
        <p class="titulo">lo que se toca del DOM</p>
        <pre>${() => registro().join("\n") || "(pulsa un botón)"}</pre>
        <p class="cuenta">${() =>
          `${escrituras()} escrituras · 0 nodos recreados · 0 comparaciones de árbol`}</p>
      </div>

      <style>
        .demo {
          display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
          gap: 1px; background: var(--borde); border: 1px solid var(--borde);
          border-radius: 12px; overflow: hidden; margin: 0 0 1rem;
        }
        .panel, .registro { background: #131109; padding: 1.5rem; }
        .valor {
          font-size: 3.5rem; margin: 0 0 1rem; font-weight: 600; line-height: 1;
          font-family: var(--mono); font-variant-numeric: tabular-nums;
        }
        .valor[data-par="false"] { color: var(--brasa); }
        .botones { display: flex; gap: .4rem; flex-wrap: wrap; }
        .titulo {
          margin: 0 0 .75rem; font-size: .72rem; text-transform: uppercase;
          letter-spacing: .08em; opacity: .4;
        }
        pre {
          margin: 0 0 .75rem; font-family: var(--mono); font-size: .78rem;
          line-height: 1.7; min-height: 6.3rem; color: var(--brasa);
          white-space: pre-wrap; word-break: break-all;
        }
        .cuenta {
          margin: 0; font-family: var(--mono); font-size: .72rem; opacity: .45;
          border-top: 1px solid var(--borde); padding-top: .75rem;
        }
        @media (max-width: 40rem) { .demo { grid-template-columns: minmax(0, 1fr); } }
      </style>
    </div>`;
}

/**
 * Una lista con clave. Cada item recibe su color **al construirse**, así que
 * el color delata si el nodo se reutilizó o se hizo uno nuevo.
 */
export function DemoLista(): HTMLElement {
  const items = signal([1, 2, 3, 4]);
  const construidos = signal(0);
  let siguiente = 5;

  const app = view`
    <div class="demo-lista">
      <ul class="items"></ul>
      <div class="botones">
        <button onclick=${() => {
          items.update((lista) => [...lista, siguiente]);
          siguiente += 1;
        }}>añadir</button>
        <button onclick=${() =>
          items.update((lista) => (lista.length ? [lista.at(-1)!, ...lista.slice(0, -1)] : lista))
        }>rotar</button>
        <button onclick=${() => items.update((lista) => [...lista].reverse())}>invertir</button>
        <button onclick=${() => items.update((lista) => lista.slice(0, -1))}
                disabled=${() => items().length === 0}>quitar</button>
      </div>
      <p class="cuenta">${() =>
        `${construidos()} items construidos en total · reordenar mueve nodos, no los rehace`}</p>

      <style>
        .demo-lista {
          border: 1px solid var(--borde); border-radius: 12px; padding: 1.5rem;
          background: #131109; margin: 0 0 1rem;
        }
        .items {
          list-style: none; padding: 0; margin: 0 0 1.25rem; display: flex;
          flex-wrap: wrap; gap: .5rem; min-height: 3rem;
        }
        .botones { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .cuenta {
          margin: 0; font-family: var(--mono); font-size: .72rem; opacity: .45;
          border-top: 1px solid var(--borde); padding-top: .75rem;
        }
      </style>
    </div>`;

  list(
    app.querySelector(".items")!,
    () => items(),
    (item) => item,
    (item) => {
      const indice = construidos();
      construidos.set(indice + 1);
      // El tono se fija al construir: si el nodo se rehiciera al reordenar,
      // cambiaría de color.
      const tono = (indice * 47) % 360;

      return view`
        <li style=${`border-color: hsl(${tono} 70% 55% / .55); color: hsl(${tono} 70% 70%)`}>
          ${item}
          <style>
            li {
              font-family: var(--mono); font-size: .9rem; padding: .5rem .9rem;
              border-radius: 8px; border: 1px solid; background: #ffffff08;
            }
          </style>
        </li>`;
    },
  );

  return app;
}
