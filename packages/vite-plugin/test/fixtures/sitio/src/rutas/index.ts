import { IslaContador } from "../islas/contador.js";

export const titulo = "Inicio";
export const cabeza = `<meta property="og:title" content="Inicio">`;

export default function Inicio() {
  return view`<section><h1>Inicio</h1><IslaContador inicial=${3}/></section>`;
}
