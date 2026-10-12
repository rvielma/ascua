import type { Children } from "ascua";

/** El marco del grupo: sus páginas lo llevan, y la carpeta no sale en la URL. */
export default function MarcoMarketing(props: { children: Children }) {
  const marco = view`<div class="marketing"><div class="contenido"></div></div>`;
  props.children(marco.querySelector(".contenido")!);
  return marco;
}
