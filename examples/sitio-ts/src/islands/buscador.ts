import { defineIsland, memo, p, signal } from "ascua";

import type { Lenguaje } from "../datos.js";

/**
 * Una lista que se filtra mientras escribes.
 *
 * El servidor la entrega completa —se ve y se indexa sin JavaScript— y el
 * cliente la adopta: los `<li>` que filtra son los mismos que llegaron.
 */
export function Buscador(props: { lenguajes: Lenguaje[] }) {
  const filtro = signal("");
  const visibles = memo(() => {
    const texto = filtro().trim().toLowerCase();
    return props.lenguajes.filter((l) => l.nombre.toLowerCase().includes(texto));
  });

  return view`
    <div class="buscador">
      <input type="search" placeholder="Filtrar lenguajes…"
        prop:value=${() => filtro()}
        oninput=${(e: Event) => filtro.set((e.target as HTMLInputElement).value)}>
      <p class="nota">${() => visibles().length} de ${props.lenguajes.length}</p>
      <ul>
        <For each=${() => visibles()}
             key=${(l: Lenguaje) => l.nombre}
             render=${(l: Lenguaje) => view`<li><b>${l.nombre}</b><span class="cifra">${l.año}</span></li>`}/>
      </ul>
    </div>`;
}

/** La isla: el buscador, con el esquema de sus props. */
export const IslaBuscador = defineIsland(
  "buscador",
  { lenguajes: p.array(p.object({ nombre: p.string, año: p.number })) },
  Buscador,
);
