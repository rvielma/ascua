/**
 * Lo que el servidor llama por cada petición: de una URL a HTML.
 *
 * No sabe de HTTP ni de Vite; `servidor.js` pone eso. Así sirve igual para
 * un servidor en Node, para una función en el edge o para prerenderizar a
 * archivos.
 */

import { renderToString } from "@ascua/runtime/servidor";

import { paginaPara } from "./paginas.js";

export function render(url: string): { html: string; titulo: string; estado: number } {
  const ruta = new URL(url, "http://x").pathname.replace(/\/+$/, "") || "/";
  const pagina = paginaPara(ruta);
  return {
    html: renderToString(pagina.construir),
    titulo: `${pagina.titulo} · Ascua`,
    estado: pagina.estado,
  };
}
