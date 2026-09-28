import { LENGUAJES } from "../../datos.js";
import { IslaBuscador } from "../../islands/buscador.js";

export const title = "Lenguajes · Ascua";

export default function Lenguajes() {
  return view`
    <section>
      <h1>Lenguajes</h1>
      <p>La lista viene completa en el HTML. El filtro adopta los mismos nodos que se generaron al construir.</p>
      <IslaBuscador lenguajes=${LENGUAJES}/>
    </section>`;
}
