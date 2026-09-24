// El sitio es HTML estático. Esto solo activa las islas de demo.
//
// Todo lo que se lee llega como HTML y funciona sin JavaScript; solo los tres
// recuadros interactivos necesitan este archivo.

import { mount } from "ascua";

import { brasas } from "./brasas.js";
import { DemoContador, DemoLista, DemoPanel } from "./demos.js";

const islas: Record<string, () => HTMLElement> = {
  contador: DemoContador,
  lista: DemoLista,
  panel: DemoPanel,
};

for (const contenedor of document.querySelectorAll<HTMLElement>("[data-isla]")) {
  const construir = islas[contenedor.dataset.isla ?? ""];
  if (construir) mount(contenedor, construir);
}

const lienzo = document.querySelector<HTMLCanvasElement>("#brasas");
if (lienzo) brasas(lienzo);
