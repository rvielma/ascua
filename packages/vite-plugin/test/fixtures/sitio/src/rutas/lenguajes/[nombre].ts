import { noExiste } from "vite-plugin-ascua/sitio";

import { LENGUAJES } from "../../datos.js";

export function parametros() {
  return LENGUAJES.map((l) => ({ nombre: l.nombre }));
}

/** Corre al construir (y en cada petición en desarrollo o con servidor). */
export async function cargar({ nombre }: { nombre: string }) {
  await new Promise((listo) => setTimeout(listo, 1));
  const lenguaje = LENGUAJES.find((l) => l.nombre === nombre);
  if (!lenguaje) throw noExiste();
  return { año: lenguaje.año, edad: 2026 - lenguaje.año };
}

type Props = { nombre: string; datos: Awaited<ReturnType<typeof cargar>> };

export const titulo = ({ nombre }: Props) => `Lenguaje ${nombre}`;
export const descripcion = ({ nombre, datos }: Props) => `${nombre} tiene ${datos.edad} años`;

export default function Lenguaje({ nombre, datos }: Props) {
  return view`<article><h1>${nombre}</h1><p>${datos.año}</p></article>`;
}
