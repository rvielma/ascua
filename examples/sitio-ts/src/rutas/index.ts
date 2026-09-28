import { IslaContador } from "../islas/index.js";

export const titulo = "Inicio · Ascua";

export default function Inicio() {
  return view`
    <section>
      <h1>HTML primero</h1>
      <p>Esta página se generó al construir. El texto no necesita JavaScript; el contador sí, y es lo único que se hidrata.</p>
      <IslaContador inicial=${3}/>
      <p class="nota">Abre las herramientas de red: la página pide un solo script, con el runtime y el contador.</p>
    </section>`;
}
