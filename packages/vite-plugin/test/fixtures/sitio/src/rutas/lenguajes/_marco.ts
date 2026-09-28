import type { Children } from "ascua";

/** El marco de la carpeta: va dentro del de la raíz. */
export default function MarcoLenguajes(props: { children: Children }) {
  const seccion = view`<section class="lenguajes"><p>Lenguajes</p><div></div></section>`;
  props.children(seccion.querySelector("div")!);
  return seccion;
}
