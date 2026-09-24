import { Metrica } from "./componentes.js";

export function Formulario() {
  return view`
    <form>
      <input type="text" disabled >
      <a >enlace</a>
      <p><</p>
      <Metrica etiqueta="x" valor=${() => 1}/>
    </form>`;
}
