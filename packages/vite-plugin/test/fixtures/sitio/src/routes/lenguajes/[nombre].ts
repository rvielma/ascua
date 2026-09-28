import { notFound } from "vite-plugin-ascua/site";

import { LENGUAJES } from "../../datos.js";

export function paths() {
  return LENGUAJES.map((l) => ({ nombre: l.nombre }));
}

/** Corre al construir (y en cada petición en desarrollo o con servidor). */
export async function load({ nombre }: { nombre: string }) {
  await new Promise((listo) => setTimeout(listo, 1));
  const lenguaje = LENGUAJES.find((l) => l.nombre === nombre);
  if (!lenguaje) throw notFound();
  return { año: lenguaje.año, edad: 2026 - lenguaje.año };
}

type Props = { nombre: string; data: Awaited<ReturnType<typeof load>> };

export const title = ({ nombre }: Props) => `Lenguaje ${nombre}`;
export const description = ({ nombre, data }: Props) => `${nombre} tiene ${data.edad} años`;

export default function Lenguaje({ nombre, data }: Props) {
  return view`<article><h1>${nombre}</h1><p>${data.año}</p></article>`;
}
