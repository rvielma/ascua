// El sitio es HTML estático. Esto solo activa las dos islas de demo.
//
// Todo lo que se lee llega como HTML y funciona sin JavaScript; solo los dos
// recuadros interactivos necesitan este archivo.

import { mount } from "@ascua/runtime";

import { DemoContador, DemoLista } from "./demos.js";

const islas: Record<string, () => HTMLElement> = {
  contador: DemoContador,
  lista: DemoLista,
};

for (const contenedor of document.querySelectorAll<HTMLElement>("[data-isla]")) {
  const construir = islas[contenedor.dataset.isla ?? ""];
  if (construir) mount(contenedor, construir);
}
