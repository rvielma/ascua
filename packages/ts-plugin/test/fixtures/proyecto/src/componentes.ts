import type { Children } from "ascua";

export function Metrica(props: { etiqueta: string; valor: () => number }) {
  return view`<div><b>${() => props.valor()}</b> ${props.etiqueta}</div>`;
}

export function Tarjeta(props: { titulo: string; children?: Children }) {
  const caja = view`<section><h2>${props.titulo}</h2><div class="cuerpo"></div></section>`;
  props.children?.(caja.querySelector(".cuerpo")!);
  return caja;
}
