import { IslaContador } from "../islands/contador.js";

export const title = "Página B";
export const description = "La de la isla";

export default function B() {
  return view`<section><h1>Página B</h1><IslaContador inicial=${5}/><a id="volver" href="/">volver</a></section>`;
}
