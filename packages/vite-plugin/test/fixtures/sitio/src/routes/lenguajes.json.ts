import { LENGUAJES } from "../datos.js";

/** No es una página: es `lenguajes.json`. */
export default function Lenguajes() {
  return JSON.stringify(LENGUAJES.map((l) => l.nombre));
}
