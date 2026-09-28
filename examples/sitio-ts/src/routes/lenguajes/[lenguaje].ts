import { LENGUAJES, slug } from "../../datos.js";

const buscar = (lenguaje: string) => LENGUAJES.find((l) => slug(l) === lenguaje);

export const title = ({ lenguaje }: { lenguaje: string }) => `${buscar(lenguaje)?.nombre} · Ascua`;

/** Una página por lenguaje: sin esto, el build no sabría cuáles generar. */
export function paths() {
  return LENGUAJES.map((l) => ({ lenguaje: slug(l) }));
}

export default function Lenguaje({ lenguaje }: { lenguaje: string }) {
  const datos = buscar(lenguaje)!;
  const vecinos = LENGUAJES.filter((l) => l !== datos && Math.abs(l.año - datos.año) <= 5);
  return view`
    <article>
      <h1>${datos.nombre}</h1>
      <p>Apareció en <span class="cifra">${datos.año}</span>. Esta página no lleva ni una línea de JavaScript.</p>
      <h2>De la misma época</h2>
      <ul>
        <For each=${() => vecinos} key=${(l: typeof datos) => l.nombre}
             render=${(l: typeof datos) => view`<li><a href=${`/lenguajes/${slug(l)}`}>${l.nombre}</a>${" "}<span class="cifra">${l.año}</span></li>`}/>
      </ul>
    </article>`;
}
