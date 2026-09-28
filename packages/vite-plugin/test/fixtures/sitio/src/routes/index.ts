import { IslaContador } from "../islands/contador.js";

export const title = "Inicio";
export const head = `<meta property="og:title" content="Inicio">`;

export default function Inicio() {
  return view`<section><h1>Inicio</h1><IslaContador inicial=${3}/></section>`;
}
